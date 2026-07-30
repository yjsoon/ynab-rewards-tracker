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

  afterEach(() => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      new Request('https://example.test/api/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: 'sync-key', ciphertext: 'ciphertext', iv: 'iv' }),
      })
    );

    expect(response.status).toBe(200);
    expect(kv.put).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
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
