import type {
  AuthUser,
  RolePermissionMatrix,
} from '../src/types/auth.ts';
import type {StoredUserRecord} from './authStore.ts';

/**
 * Pure Web-Standards HTTP Router compatible with BOTH:
 *  - Cloudflare Workers (Fetch API Request -> Response, zero Express / node:http)
 *  - Node.js / Express (via bridge middleware on local dev & Node deployments)
 */

export interface UniversalRequest {
  method: string;
  path: string;
  baseUrl: string;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | undefined>;
  body: any;
  currentUser?: StoredUserRecord;
  publicUser?: AuthUser;
  permissions?: RolePermissionMatrix;
}

export interface UniversalResponse {
  status(code: number): UniversalResponse;
  setHeader(name: string, value: string): UniversalResponse;
  json(payload: unknown): void;
  send(payload: string | Buffer | Uint8Array): void;
}

export type UniversalNext = (err?: unknown) => void;

export type UniversalHandler = (
  req: UniversalRequest,
  res: UniversalResponse,
  next: UniversalNext,
) => void | Promise<void>;

interface CompiledRoute {
  method: string; // 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'ALL'
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handlers: UniversalHandler[];
}

interface MountedChild {
  prefix: string;
  router: UniversalRouter;
}

function compileRoutePattern(pattern: string): {regex: RegExp; paramNames: string[]} {
  const paramNames: string[] = [];
  const normalized = pattern === '/' ? '/' : pattern.replace(/\/+$/, '');
  const escaped = normalized
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return {
    regex: new RegExp(`^${escaped}/?$`),
    paramNames,
  };
}

export class UniversalRouter {
  private routes: CompiledRoute[] = [];
  private children: MountedChild[] = [];

  private addRoute(method: string, pattern: string, handlers: UniversalHandler[]) {
    const {regex, paramNames} = compileRoutePattern(pattern);
    this.routes.push({method, pattern, regex, paramNames, handlers});
  }

  get(pattern: string, ...handlers: UniversalHandler[]) {
    this.addRoute('GET', pattern, handlers);
    return this;
  }

  post(pattern: string, ...handlers: UniversalHandler[]) {
    this.addRoute('POST', pattern, handlers);
    return this;
  }

  patch(pattern: string, ...handlers: UniversalHandler[]) {
    this.addRoute('PATCH', pattern, handlers);
    return this;
  }

  put(pattern: string, ...handlers: UniversalHandler[]) {
    this.addRoute('PUT', pattern, handlers);
    return this;
  }

  delete(pattern: string, ...handlers: UniversalHandler[]) {
    this.addRoute('DELETE', pattern, handlers);
    return this;
  }

  use(prefixOrRouter: string | UniversalRouter, maybeRouter?: UniversalRouter) {
    if (typeof prefixOrRouter === 'string' && maybeRouter) {
      this.children.push({
        prefix: prefixOrRouter.replace(/\/+$/, ''),
        router: maybeRouter,
      });
    } else if (prefixOrRouter instanceof UniversalRouter) {
      this.children.push({prefix: '', router: prefixOrRouter});
    }
    return this;
  }

  match(
    method: string,
    subPath: string,
  ): {handlers: UniversalHandler[]; params: Record<string, string>; matchedPath: string} | null {
    const cleanPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
    const upperMethod = method.toUpperCase();

    for (const child of this.children) {
      if (!child.prefix) {
        const hit = child.router.match(upperMethod, cleanPath);
        if (hit) return hit;
      } else if (cleanPath === child.prefix || cleanPath.startsWith(`${child.prefix}/`)) {
        const rest = cleanPath.slice(child.prefix.length) || '/';
        const hit = child.router.match(upperMethod, rest);
        if (hit) return hit;
      }
    }

    for (const route of this.routes) {
      if (route.method !== upperMethod && route.method !== 'ALL') continue;
      const m = route.regex.exec(cleanPath);
      if (!m) continue;
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(m[idx + 1] || '');
      });
      return {handlers: route.handlers, params, matchedPath: cleanPath};
    }

    return null;
  }

  async dispatch(req: UniversalRequest, res: UniversalResponse): Promise<boolean> {
    const matched = this.match(req.method, req.path);
    if (!matched) return false;

    req.params = matched.params;

    let idx = 0;
    const runNext = async (): Promise<void> => {
      if (idx >= matched.handlers.length) return;
      const handler = matched.handlers[idx++];
      let nextCalled = false;
      let nextErr: unknown = undefined;

      await new Promise<void>((resolve, reject) => {
        const next: UniversalNext = (err?: unknown) => {
          nextCalled = true;
          nextErr = err;
          resolve();
        };
        try {
          const maybePromise = handler(req, res, next);
          if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
            (maybePromise as Promise<void>).then(
              () => {
                if (!nextCalled) resolve();
              },
              (err) => reject(err),
            );
          } else if (!nextCalled) {
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      });

      if (nextErr) {
        throw nextErr;
      }
      if (nextCalled) {
        await runNext();
      }
    };

    await runNext();
    return true;
  }

  /**
   * Native Cloudflare Workers / Web Fetch API execution (zero Express / node:http).
   */
  async handleFetch(request: Request, basePrefix = '/api'): Promise<Response | null> {
    const url = new URL(request.url);
    const normalizedPrefix = basePrefix.replace(/\/+$/, '');
    if (normalizedPrefix && !url.pathname.startsWith(normalizedPrefix)) {
      return null;
    }
    const subPath = normalizedPrefix
      ? url.pathname.slice(normalizedPrefix.length) || '/'
      : url.pathname;

    const method = request.method.toUpperCase();
    if (!this.match(method, subPath)) {
      return null;
    }

    const query: Record<string, string | string[] | undefined> = {};
    url.searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing === undefined) {
        query[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    });

    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: any = {};
    if (method !== 'GET' && method !== 'HEAD') {
      const contentType = headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await request.text();
        if (text.trim()) {
          try {
            body = JSON.parse(text);
          } catch {
            return new Response(
              JSON.stringify({error: 'صيغة بيانات JSON المرسلة غير صالحة.'}),
              {
                status: 400,
                headers: {'Content-Type': 'application/json; charset=utf-8'},
              },
            );
          }
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const text = await request.text();
        const formObj: Record<string, string> = {};
        new URLSearchParams(text).forEach((v, k) => {
          formObj[k] = v;
        });
        body = formObj;
      }
    }

    let statusCode = 200;
    const outHeaders = new Headers();
    let responseBody: BodyInit | null = null;
    let sent = false;

    const uRes: UniversalResponse = {
      status(code: number) {
        statusCode = code;
        return uRes;
      },
      setHeader(name: string, value: string) {
        outHeaders.set(name, value);
        return uRes;
      },
      json(payload: unknown) {
        if (!outHeaders.has('Content-Type')) {
          outHeaders.set('Content-Type', 'application/json; charset=utf-8');
        }
        responseBody = JSON.stringify(payload);
        sent = true;
      },
      send(payload: string | Buffer | Uint8Array) {
        if (typeof payload === 'string') {
          responseBody = payload;
        } else {
          // Copy into a clean Uint8Array backed by a standard ArrayBuffer for Web Fetch Response
          const copy = new Uint8Array(payload.byteLength);
          copy.set(payload);
          responseBody = copy.buffer;
        }
        sent = true;
      },
    };

    const uReq: UniversalRequest = {
      method,
      path: subPath,
      baseUrl: normalizedPrefix,
      params: {},
      query,
      headers,
      body,
    };

    const matched = await this.dispatch(uReq, uRes);
    if (!matched) return null;
    if (!sent) {
      return new Response(null, {status: statusCode, headers: outHeaders});
    }
    return new Response(responseBody, {status: statusCode, headers: outHeaders});
  }
}

export function createUniversalRouter(): UniversalRouter {
  return new UniversalRouter();
}
