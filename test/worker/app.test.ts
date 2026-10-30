import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../worker';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Worker application', () => {
  it('serves the health contract through Hono and Chanfana', async () => {
    const response = await app.request('/api/health', {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('supports bodyless health checks with HEAD', async () => {
    const response = await app.request('/api/health', {
      method: 'HEAD',
    }, env);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('');
  });

  it('publishes the generated OpenAPI contract', async () => {
    const response = await app.request('/api/openapi.json', {}, env);
    const contract = await response.json<{
      openapi: string;
      paths: Record<string, unknown>;
    }>();

    expect(response.status).toBe(200);
    expect(contract.openapi).toBe('3.1.0');
    expect(contract.paths).toHaveProperty('/api/health');
  });

  it('returns JSON 404 responses for unknown API paths', async () => {
    const response = await app.request('/api/missing', {}, env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  it('reserves missing media routes as JSON responses', async () => {
    const response = await app.request('/media/missing', {}, env);

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('returns 405 for unsupported health methods', async () => {
    const response = await app.request('/api/health', {
      method: 'POST',
    }, env);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });

  it('does not include query strings in structured request logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await app.request('/api/health?token=not-for-logs', {}, env);

    const entry = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(entry.path).toBe('/api/health');
    expect(JSON.stringify(entry)).not.toContain('not-for-logs');
  });

  it('falls back to the static asset binding outside dynamic routes', async () => {
    const response = await app.request('/', {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('uses isolated local D1 and R2 bindings', async () => {
    const row = await env.DB.prepare('SELECT 1 AS value').first<{
      value: number;
    }>();
    expect(row).toEqual({ value: 1 });

    const key = 'tests/task-1.1.txt';
    await env.MEDIA.put(key, 'local-only');
    await expect(env.MEDIA.get(key)).resolves.not.toBeNull();
    await env.MEDIA.delete(key);
  });
});
