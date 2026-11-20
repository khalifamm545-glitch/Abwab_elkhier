import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {authApiRouter} from './server/authRoutes.ts';
import {
  getPersistentStorageMode,
  initAuthStore,
  shutdownAuthStore,
} from './server/authStore.ts';
import {charityApiRouter} from './server/charityRoutes.ts';
import {getObjectStorageMode} from './server/r2Storage.ts';
import type {UniversalRequest, UniversalResponse} from './server/universalRouter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const storageMode = await initAuthStore();
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers across all HTTP responses
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({limit: '8mb'}));
  app.use(express.urlencoded({extended: true}));

  // Public health check for HTTPS hosts — exposes zero sensitive data
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      app: 'abwab-el-khair',
      runtime: 'node',
      storageMode: getPersistentStorageMode(),
      objectStorageMode: getObjectStorageMode(),
    });
  });

  // Strict no-cache headers on all API routes so browsers/proxies/SW NEVER cache financial or beneficiary data
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Express -> UniversalRouter bridge (shares 100% of API handlers with Cloudflare Workers)
  app.use('/api', async (req, res, next) => {
    const normalizedHeaders: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      normalizedHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    }
    const normalizedQuery: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string') {
        normalizedQuery[k] = v;
      } else if (Array.isArray(v)) {
        normalizedQuery[k] = v.map(String);
      }
    }

    const uReq: UniversalRequest = {
      method: req.method,
      path: req.path,
      baseUrl: req.baseUrl || '/api',
      params: {},
      query: normalizedQuery,
      headers: normalizedHeaders,
      body: req.body,
    };

    const uRes: UniversalResponse = {
      status(code: number) {
        res.status(code);
        return uRes;
      },
      setHeader(name: string, value: string) {
        res.setHeader(name, value);
        return uRes;
      },
      json(payload: unknown) {
        res.json(payload);
      },
      send(payload: string | Buffer | Uint8Array) {
        res.send(payload instanceof Uint8Array && !Buffer.isBuffer(payload) ? Buffer.from(payload) : payload);
      },
    };

    try {
      const handledByAuth = await authApiRouter.dispatch(uReq, uRes);
      if (handledByAuth) return;
      const handledByCharity = await charityApiRouter.dispatch(uReq, uRes);
      if (handledByCharity) return;
      next();
    } catch (err) {
      next(err);
    }
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('sw.js') || filePath.endsWith('registerSW.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (
            filePath.endsWith('manifest.json') ||
            filePath.endsWith('manifest.webmanifest')
          ) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[أبواب الخير] Server running on http://0.0.0.0:${PORT} (storage: ${storageMode})`);
  });

  const handleShutdown = async () => {
    try {
      await shutdownAuthStore();
    } finally {
      httpServer.close(() => process.exit(0));
    }
  };
  process.once('SIGTERM', () => void handleShutdown());
  process.once('SIGINT', () => void handleShutdown());
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
