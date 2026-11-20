import {Hono} from 'hono';
import {authApiRouter} from '../server/authRoutes.ts';
import {setRuntimeSessionSecret} from '../server/authSecurity.ts';
import {
  beginWorkerRequestStore,
  commitWorkerRequestStore,
  getPersistentStorageMode,
  logSecurityEvent,
  readAuthStore,
  writeAuthStore,
} from '../server/authStore.ts';
import {charityApiRouter} from '../server/charityRoutes.ts';
import {setRuntimeDatabaseUrl} from '../server/neonPersistence.ts';
import {
  createEncryptedBackup,
  getBackupRetentionPolicy,
  getObjectStorageMode,
  setRuntimeR2Bucket,
  setRuntimeRetentionConfig,
  type R2BucketLike,
} from '../server/r2Storage.ts';

export interface AssetsFetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  DATABASE_URL?: string;
  SESSION_SECRET?: string;
  ABWAB_FILES?: R2BucketLike;
  ASSETS?: AssetsFetcherLike;
  BACKUP_RETENTION_COUNT?: string;
  BACKUP_RETENTION_DAYS?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
}

function bindWorkerEnv(env: WorkerEnv): void {
  setRuntimeSessionSecret(env.SESSION_SECRET, true);
  setRuntimeDatabaseUrl(env.DATABASE_URL);
  setRuntimeR2Bucket(env.ABWAB_FILES || null);
  setRuntimeRetentionConfig({
    maxCount: env.BACKUP_RETENTION_COUNT,
    maxAgeDays: env.BACKUP_RETENTION_DAYS,
  });
}

function applySecurityHeaders(response: Response, requestUrl: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (requestUrl.startsWith('https://')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyNoStoreHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const app = new Hono<{Bindings: WorkerEnv}>();

// Public health check — zero sensitive data exposed
app.get('/api/health', (c) => {
  bindWorkerEnv(c.env);
  const res = c.json({
    ok: true,
    app: 'abwab-el-khair',
    runtime: 'cloudflare_workers',
    storageMode: getPersistentStorageMode(),
    objectStorageMode: getObjectStorageMode(),
    retentionPolicy: getBackupRetentionPolicy(),
  });
  return applySecurityHeaders(applyNoStoreHeaders(res), c.req.url);
});

// Unified API handler backed by Neon PostgreSQL (structured data) & Cloudflare R2 (files + encrypted backups)
app.all('/api/*', async (c) => {
  bindWorkerEnv(c.env);
  try {
    await beginWorkerRequestStore(c.env.DATABASE_URL);

    let apiResponse = await authApiRouter.handleFetch(c.req.raw, '/api');
    if (!apiResponse) {
      apiResponse = await charityApiRouter.handleFetch(c.req.raw, '/api');
    }

    await commitWorkerRequestStore(c.env.DATABASE_URL);

    if (!apiResponse) {
      const notFound = c.json({error: 'المسار المطلوب غير موجود.'}, 404);
      return applySecurityHeaders(applyNoStoreHeaders(notFound), c.req.url);
    }

    return applySecurityHeaders(applyNoStoreHeaders(apiResponse), c.req.url);
  } catch (err) {
    console.error('[أبواب الخير - Worker API Error]:', err);
    const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع في الخادم.';
    const errorRes = c.json({error: message}, 500);
    return applySecurityHeaders(applyNoStoreHeaders(errorRes), c.req.url);
  }
});

// Serve built Vite PWA frontend + SPA fallback via Cloudflare Workers Static Assets
app.all('*', async (c) => {
  bindWorkerEnv(c.env);
  if (!c.env.ASSETS) {
    return applySecurityHeaders(
      c.text('أبواب الخير — خدمة الواجهة الساكنة غير مربوطة في بيئة Worker الحالية.', 404),
      c.req.url,
    );
  }

  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  const url = new URL(c.req.url);
  const pathname = url.pathname;
  const headers = new Headers(assetRes.headers);

  if (pathname.endsWith('/sw.js') || pathname.endsWith('/registerSW.js')) {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (pathname.endsWith('/manifest.json') || pathname.endsWith('/manifest.webmanifest')) {
    headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
    headers.set('Cache-Control', 'no-cache');
  } else if (pathname === '/' || pathname.endsWith('.html') || !pathname.includes('.')) {
    headers.set('Cache-Control', 'no-cache');
  }

  return applySecurityHeaders(
    new Response(assetRes.body, {
      status: assetRes.status,
      statusText: assetRes.statusText,
      headers,
    }),
    c.req.url,
  );
});

export async function runScheduledEncryptedBackup(
  env: WorkerEnv,
  cronExpression = '0 3 * * *',
): Promise<{backupKey: string; prunedCount: number; sha256: string}> {
  bindWorkerEnv(env);
  await beginWorkerRequestStore(env.DATABASE_URL);
  const state = readAuthStore();
  const result = await createEncryptedBackup(state, {
    label: 'scheduled-daily',
    createdBy: `cloudflare_cron:${cronExpression}`,
  });

  logSecurityEvent(state, {
    actorUserId: null,
    actorName: 'النسخ الاحتياطي التلقائي (Cloudflare Cron)',
    actorRole: 'anonymous',
    actionCode: 'SCHEDULED_ENCRYPTED_BACKUP',
    summaryAr: `تم إنشاء نسخة احتياطية مشفرة دورية (AES-256-GCM) وحفظها في Cloudflare R2 (${result.backup.key}) مع حذف (${result.prunedKeys.length}) نسخة قديمة وفق سياسة الاحتفاظ.`,
  });
  writeAuthStore(state);
  await commitWorkerRequestStore(env.DATABASE_URL);

  return {
    backupKey: result.backup.key,
    prunedCount: result.prunedKeys.length,
    sha256: result.backup.sha256,
  };
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx?: ExecutionContextLike): Response | Promise<Response> {
    return app.fetch(request, env, ctx as any);
  },

  async scheduled(
    controller: ScheduledControllerLike,
    env: WorkerEnv,
    ctx?: ExecutionContextLike,
  ): Promise<void> {
    const task = runScheduledEncryptedBackup(env, controller.cron || '0 3 * * *').catch((err) => {
      console.error('[أبواب الخير - Scheduled Backup Error]:', err);
      throw err;
    });
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(task);
    } else {
      await task;
    }
  },
};
