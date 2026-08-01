import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext,
}));

import { DELETE, GET, POST } from './route';

const originalCloudflareEnv = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  namespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
  previewNamespaceId: process.env.CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
};

function createNativeKV() {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

describe('cloud sync route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getCloudflareContext.mockReset();
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    delete process.env.CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  });

  it('returns 400 for malformed POST JSON', async () => {
    const response = await POST(new Request('https://example.test/api/cloud-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid payload' });
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalCloudflareEnv.accountId === undefined) {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
    } else {
      process.env.CLOUDFLARE_ACCOUNT_ID = originalCloudflareEnv.accountId;
    }
    if (originalCloudflareEnv.namespaceId === undefined) {
      delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    } else {
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = originalCloudflareEnv.namespaceId;
    }
    if (originalCloudflareEnv.previewNamespaceId === undefined) {
      delete process.env.CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID;
    } else {
      process.env.CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID = originalCloudflareEnv.previewNamespaceId;
    }
    if (originalCloudflareEnv.apiToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = originalCloudflareEnv.apiToken;
    }
  });

  it('uses REST for POST without calling the native KV mutation', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'process-account';
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'process-namespace';
    process.env.CLOUDFLARE_API_TOKEN = 'process-token';
    const kv = createNativeKV();
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUD_SYNC_KV: kv,
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      new Request('https://example.test/api/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: 'sync-key',
          ciphertext: 'ciphertext',
          iv: 'iv',
          expectedUpdatedAt: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(kv.put).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [endpoint, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(endpoint.href).toBe(
      'https://api.cloudflare.com/client/v4/accounts/worker-account/storage/kv/namespaces/worker-namespace/values/sync-key'
    );
    expect(init).toMatchObject({
      method: 'PUT',
      headers: {
        Authorization: 'Bearer worker-token',
        'Content-Type': 'text/plain',
      },
    });
  });

  it('rejects concurrent uploads that share the same stale revision', async () => {
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    let stored: string | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      if (init.method === 'GET') {
        return stored === null
          ? new Response(null, { status: 404 })
          : new Response(stored, { status: 200 });
      }
      if (init.method === 'PUT') {
        stored = String(init.body);
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected ${init.method} request`);
    }));

    const upload = (ciphertext: string) => POST(
      new Request('https://example.test/api/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: 'sync-key',
          ciphertext,
          iv: 'iv',
          expectedUpdatedAt: null,
        }),
      }),
    );
    const responses = await Promise.all([upload('device-a'), upload('device-b')]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    await expect(conflict.json()).resolves.toEqual({
      error: 'Cloud backup changed on another device. Restore it before saving again.',
    });
    expect(JSON.parse(stored!).ciphertext).toMatch(/^device-[ab]$/);
  });

  it('keeps uploads from older clients without expectedUpdatedAt compatible', async () => {
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    let stored = JSON.stringify({
      ciphertext: 'current',
      iv: 'iv',
      version: 1,
      updatedAt: '2026-07-31T00:00:00.000Z',
    });
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      if (init.method === 'GET') return new Response(stored, { status: 200 });
      if (init.method === 'PUT') {
        stored = String(init.body);
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected ${init.method} request`);
    }));

    const response = await POST(new Request('https://example.test/api/cloud-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId: 'sync-key', ciphertext: 'older-client', iv: 'iv' }),
    }));

    expect(response.status).toBe(200);
    expect(JSON.parse(stored).ciphertext).toBe('older-client');
  });

  it('persists one stable revision when reading a legacy record without updatedAt', async () => {
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    let stored = JSON.stringify({ ciphertext: 'legacy', iv: 'legacy-iv' });
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      if (init.method === 'GET') return new Response(stored, { status: 200 });
      if (init.method === 'PUT') {
        stored = String(init.body);
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected ${init.method} request`);
    }));

    const request = () => new Request('https://example.test/api/cloud-sync?key=legacy-key');
    const first = await GET(request());
    const second = await GET(request());
    const firstBody = await first.json() as { updatedAt: string };
    const secondBody = await second.json() as { updatedAt: string };

    expect(firstBody.updatedAt).toEqual(expect.any(String));
    expect(secondBody.updatedAt).toBe(firstBody.updatedAt);
  });

  it('backfills a legacy revision through a native binding-only runtime', async () => {
    let stored = JSON.stringify({ ciphertext: 'legacy-native', iv: 'legacy-iv' });
    const kv = createNativeKV();
    kv.get.mockImplementation(async () => stored);
    kv.put.mockImplementation(async (_key: string, value: string) => {
      stored = value;
    });
    getCloudflareContext.mockResolvedValue({ env: { CLOUD_SYNC_KV: kv } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = () => new Request('https://example.test/api/cloud-sync?key=native-legacy-key');
    const first = await GET(request());
    const second = await GET(request());
    const firstBody = await first.json() as { updatedAt: string };
    const secondBody = await second.json() as { updatedAt: string };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.updatedAt).toEqual(expect.any(String));
    expect(secondBody.updatedAt).toBe(firstBody.updatedAt);
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails safely when a legacy revision cannot be durably backfilled', async () => {
    const kv = createNativeKV();
    kv.get.mockResolvedValue(JSON.stringify({ ciphertext: 'legacy-failure', iv: 'legacy-iv' }));
    kv.put.mockRejectedValue(new Error('binding unavailable'));
    getCloudflareContext.mockResolvedValue({ env: { CLOUD_SYNC_KV: kv } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = () => new Request('https://example.test/api/cloud-sync?key=failing-legacy-key');
    const first = await GET(request());
    const second = await GET(request());

    expect(first.status).toBe(502);
    expect(second.status).toBe(502);
    await expect(first.json()).resolves.toEqual({ error: 'KV error: binding unavailable' });
    await expect(second.json()).resolves.toEqual({ error: 'KV error: binding unavailable' });
    expect(kv.put).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses REST for DELETE without calling the native KV mutation', async () => {
    const kv = createNativeKV();
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUD_SYNC_KV: kv,
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(new Request('https://example.test/api/cloud-sync?key=sync-key'));

    expect(response.status).toBe(200);
    expect(kv.delete).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('keeps GET on the native KV binding', async () => {
    const kv = createNativeKV();
    kv.get.mockResolvedValue(
      JSON.stringify({
        ciphertext: 'stored-ciphertext',
        iv: 'stored-iv',
        version: 1,
        updatedAt: '2026-07-30T00:00:00.000Z',
      })
    );
    getCloudflareContext.mockResolvedValue({ env: { CLOUD_SYNC_KV: kv } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new Request('https://example.test/api/cloud-sync?key=sync-key'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ciphertext: 'stored-ciphertext',
      iv: 'stored-iv',
      version: 1,
      updatedAt: '2026-07-30T00:00:00.000Z',
    });
    expect(kv.get).toHaveBeenCalledWith('sync-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the native KV read rejects', async () => {
    const kv = createNativeKV();
    kv.get.mockRejectedValue(new Error('binding unavailable'));
    getCloudflareContext.mockResolvedValue({ env: { CLOUD_SYNC_KV: kv } });
    vi.stubGlobal('fetch', vi.fn());

    const response = await GET(
      new Request('https://example.test/api/cloud-sync?key=unavailable-key'),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'KV error: binding unavailable',
    });
  });

  it('falls back to process.env when Worker configuration is unavailable', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'process-account';
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'process-namespace';
    process.env.CLOUDFLARE_API_TOKEN = 'process-token';
    getCloudflareContext.mockRejectedValue(new Error('Not running in a Worker'));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(new Request('https://example.test/api/cloud-sync?key=process-key'));

    expect(response.status).toBe(200);
    const [endpoint, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.href).toContain(
      '/accounts/process-account/storage/kv/namespaces/process-namespace/values/process-key'
    );
    expect(init.headers).toMatchObject({ Authorization: 'Bearer process-token' });
  });

  it.each(['http://localhost:8787', 'http://127.0.0.1:8787', 'http://[::1]:8787'])(
    'uses the preview namespace for local REST mutations at %s',
    async (origin) => {
      getCloudflareContext.mockResolvedValue({
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'worker-account',
          CLOUDFLARE_KV_NAMESPACE_ID: 'production-namespace',
          CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID: 'preview-namespace',
          CLOUDFLARE_API_TOKEN: 'worker-token',
        },
      });
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const response = await DELETE(new Request(`${origin}/api/cloud-sync?key=preview-key`));

      expect(response.status).toBe(200);
      const [endpoint] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(endpoint.href).toContain('/namespaces/preview-namespace/values/preview-key');
    }
  );

  it('returns a controlled fallback for non-JSON upstream errors', async () => {
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>error code: 1101</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        })
      )
    );

    const response = await DELETE(new Request('https://example.test/api/cloud-sync?key=sync-key'));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'Cloudflare (502): Failed to delete cloud sync data',
    });
  });

  it('uses a structured Cloudflare error message when available', async () => {
    getCloudflareContext.mockResolvedValue({
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'worker-account',
        CLOUDFLARE_KV_NAMESPACE_ID: 'worker-namespace',
        CLOUDFLARE_API_TOKEN: 'worker-token',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            success: false,
            errors: [{ code: 10000, message: 'Authentication failed' }],
          },
          { status: 403 }
        )
      )
    );

    const response = await DELETE(new Request('https://example.test/api/cloud-sync?key=sync-key'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Cloudflare (403): Authentication failed',
    });
  });
});
