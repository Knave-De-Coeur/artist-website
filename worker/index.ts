import { fromHono } from 'chanfana';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HealthEndpoint } from './routes/health';

type AppEnvironment = {
  Bindings: Env;
  Variables: {
    requestId: string;
  };
};

export type AppContext = Context<AppEnvironment>;

const app = new Hono<AppEnvironment>();

function requestMetadata(c: AppContext, startedAt: number) {
  return {
    requestId: c.get('requestId'),
    method: c.req.method,
    path: c.req.path,
    durationMs: Date.now() - startedAt,
  };
}

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  c.set('requestId', requestId);

  try {
    await next();
  } catch (error) {
    console.error(JSON.stringify({
      event: 'request.failed',
      ...requestMetadata(c, startedAt),
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }));
    throw error;
  }

  c.header('x-request-id', requestId);
  console.log(JSON.stringify({
    event: 'request.complete',
    ...requestMetadata(c, startedAt),
    status: c.res.status,
  }));
});

app.onError((error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();

  if (error instanceof HTTPException) {
    const response = error.getResponse();
    response.headers.set('x-request-id', requestId);
    return response;
  }

  return c.json({
    ok: false,
    code: 'server_error',
  }, 500, {
    'x-request-id': requestId,
  });
});

const api = fromHono(new Hono<AppEnvironment>(), {
  base: '/api',
  docs_url: '/docs',
  redoc_url: null,
  openapi_url: '/openapi.json',
  openapiVersion: '3.1',
  schema: {
    info: {
      title: 'Artist Website API',
      version: '0.1.0',
    },
  },
});

api.get('/health', HealthEndpoint);
app.route('/', api);

function methodNotAllowed(c: AppContext): Response {
  return c.json({
    ok: false,
    code: 'method_not_allowed',
  }, 405, {
    allow: 'GET, HEAD',
  });
}

function notFound(c: AppContext): Response {
  return c.json({
    ok: false,
    code: 'not_found',
  }, 404);
}

app.all('/api/health', methodNotAllowed);
app.all('/api', notFound);
app.all('/api/*', notFound);

app.on(['GET', 'HEAD'], ['/admin', '/admin/*'], async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const adminShellUrl = new URL('/admin/index.html', c.req.url);
  return c.env.ASSETS.fetch(new Request(adminShellUrl, c.req.raw));
});
app.all('/admin', methodNotAllowed);
app.all('/admin/*', methodNotAllowed);

app.all('/media', notFound);
app.all('/media/*', notFound);
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export { app };
export default app;
