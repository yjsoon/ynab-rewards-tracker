import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const VERSION = 1;

interface CloudflareError {
  errors?: Array<{ message?: unknown }>;
}

class CloudflareKVError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Type for Cloudflare KV namespace
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const localOperationTails = new Map<string, Promise<void>>();

/**
 * Keeps local/dev route calls ordered inside one Node process. Production
 * requests bypass this route and use the per-key Durable Object authority.
 */
async function withLocalKeyOperationQueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localOperationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  localOperationTails.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localOperationTails.get(key) === current) localOperationTails.delete(key);
  }
}

/**
 * Get native KV binding if running on Cloudflare, otherwise null.
 */
async function getNativeKV(): Promise<KVNamespace | null> {
  try {
    const ctx = await getCloudflareContext();
    const env = ctx?.env as Record<string, unknown> | undefined;
    const kv = env?.CLOUD_SYNC_KV;
    if (
      kv &&
      typeof kv === 'object' &&
      'get' in kv && typeof (kv as Record<string, unknown>).get === 'function' &&
      'put' in kv && typeof (kv as Record<string, unknown>).put === 'function' &&
      'delete' in kv && typeof (kv as Record<string, unknown>).delete === 'function'
    ) {
      return kv as KVNamespace;
    }
    return null;
  } catch {
    // Not running on Cloudflare
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API configuration (used for mutations and as a read fallback)
// ─────────────────────────────────────────────────────────────────────────────

function getStringEnvValue(env: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function getCloudflareRESTConfig(requestUrl: string): Promise<{
  accountId?: string;
  namespaceId?: string;
  apiToken?: string;
}> {
  let workerEnv: Record<string, unknown> | undefined;

  try {
    const ctx = await getCloudflareContext();
    workerEnv = ctx?.env as Record<string, unknown> | undefined;
  } catch {
    // Not running on Cloudflare
  }

  const hostname = new URL(requestUrl).hostname;
  const usePreviewNamespace =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const namespaceEnvKey = usePreviewNamespace
    ? 'CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID'
    : 'CLOUDFLARE_KV_NAMESPACE_ID';

  return {
    accountId: getStringEnvValue(workerEnv, 'CLOUDFLARE_ACCOUNT_ID') ?? process.env.CLOUDFLARE_ACCOUNT_ID,
    namespaceId:
      getStringEnvValue(workerEnv, namespaceEnvKey) ?? process.env[namespaceEnvKey],
    apiToken: getStringEnvValue(workerEnv, 'CLOUDFLARE_API_TOKEN') ?? process.env.CLOUDFLARE_API_TOKEN,
  };
}

async function requestCloudflareKV(key: string, requestUrl: string, init: RequestInit): Promise<Response> {
  const { accountId, namespaceId, apiToken } = await getCloudflareRESTConfig(requestUrl);

  if (!accountId || !namespaceId || !apiToken) {
    return Response.json(
      {
        success: false,
        errors: [{ code: 501, message: 'Cloud sync not configured' }],
      },
      { status: 501 }
    );
  }

  const endpoint = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(
      key
    )}`
  );

  const response = await fetch(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'text/plain',
      ...(init.headers || {}),
    },
  });

  if (!response.ok && process.env.NODE_ENV !== 'production') {
    console.error('Cloud sync KV request failed', {
      method: init.method || 'GET',
      status: response.status,
      statusText: response.statusText,
      endpoint: endpoint.href,
    });
  }

  return response;
}

async function getCloudflareErrorMessage(response: Response, fallback: string): Promise<string> {
  const bodyText = await response.text().catch(() => '');

  if (!bodyText) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(bodyText) as CloudflareError;
    const message = parsed.errors?.[0]?.message;
    return typeof message === 'string' && message.length > 0 ? message : fallback;
  } catch {
    return fallback;
  }
}

async function storeValueREST(key: string, value: string, requestUrl: string): Promise<void> {
  const response = await requestCloudflareKV(key, requestUrl, {
    method: 'PUT',
    body: value,
  });

  if (!response.ok) {
    const message = await getCloudflareErrorMessage(response, 'Failed to store cloud sync data');
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${message}`, response.status || 502);
  }
}

async function retrieveValueREST(key: string, requestUrl: string): Promise<string | null> {
  const response = await requestCloudflareKV(key, requestUrl, {
    method: 'GET',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await getCloudflareErrorMessage(response, 'Failed to retrieve cloud sync data');
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${message}`, response.status || 502);
  }

  return response.text();
}

async function deleteValueREST(key: string, requestUrl: string): Promise<void> {
  const response = await requestCloudflareKV(key, requestUrl, {
    method: 'DELETE',
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const message = await getCloudflareErrorMessage(response, 'Failed to delete cloud sync data');
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${message}`, response.status || 502);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KV operations (native reads, REST mutations)
// ─────────────────────────────────────────────────────────────────────────────

async function storeValue(key: string, value: string, requestUrl: string): Promise<void> {
  await storeValueREST(key, value, requestUrl);
}

async function retrieveValue(key: string, requestUrl: string): Promise<string | null> {
  const kv = await getNativeKV();
  if (kv) {
    try {
      return kv.get(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retrieve cloud sync data';
      throw new CloudflareKVError(`KV error: ${message}`, 502);
    }
  }
  return retrieveValueREST(key, requestUrl);
}

async function deleteValue(key: string, requestUrl: string): Promise<void> {
  await deleteValueREST(key, requestUrl);
}

interface StoredCloudBackup {
  ciphertext: string;
  iv: string;
  version: number;
  updatedAt: string;
}

async function readRevisionedValue(
  key: string,
  requestUrl: string,
  retrieve: (key: string, requestUrl: string) => Promise<string | null>,
): Promise<StoredCloudBackup | null> {
  const stored = await retrieve(key, requestUrl);
  if (!stored) {
    return null;
  }

  const parsed = JSON.parse(stored) as Partial<StoredCloudBackup>;
  if (typeof parsed.ciphertext !== 'string' || typeof parsed.iv !== 'string') {
    throw new Error('Stored cloud backup is invalid');
  }

  const revisioned: StoredCloudBackup = {
    ciphertext: parsed.ciphertext,
    iv: parsed.iv,
    version: typeof parsed.version === 'number' ? parsed.version : VERSION,
    updatedAt: typeof parsed.updatedAt === 'string'
      ? parsed.updatedAt
      : new Date().toISOString(),
  };
  if (typeof parsed.updatedAt !== 'string') {
    await storeValue(key, JSON.stringify(revisioned), requestUrl);
  }
  return revisioned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { keyId, ciphertext, iv, expectedUpdatedAt } = body ?? {};
    const hasExpectedRevision = body !== null
      && typeof body === 'object'
      && Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt');

    if (
      typeof keyId !== 'string'
      || typeof ciphertext !== 'string'
      || typeof iv !== 'string'
      || (hasExpectedRevision && expectedUpdatedAt !== null && typeof expectedUpdatedAt !== 'string')
    ) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    return await withLocalKeyOperationQueue(keyId, async () => {
      const current = await readRevisionedValue(keyId, request.url, retrieveValueREST);
      if (hasExpectedRevision) {
        if ((current?.updatedAt ?? null) !== expectedUpdatedAt) {
          return NextResponse.json(
            { error: 'Cloud backup changed on another device. Restore it before saving again.' },
            { status: 409 },
          );
        }
      }

      const currentTimestamp = typeof current?.updatedAt === 'string'
        ? Date.parse(current.updatedAt)
        : Number.NaN;
      const now = Date.now();
      const updatedAt = new Date(
        Number.isFinite(currentTimestamp) && currentTimestamp >= now
          ? currentTimestamp + 1
          : now,
      ).toISOString();
      const payload = JSON.stringify({ ciphertext, iv, version: VERSION, updatedAt });
      await storeValue(keyId, payload, request.url);

      return NextResponse.json({ updatedAt, version: VERSION });
    });
  } catch (error) {
    if (error instanceof CloudflareKVError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('key');

  if (!keyId) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
  }

  try {
    return await withLocalKeyOperationQueue(keyId, async () => {
      const stored = await readRevisionedValue(keyId, request.url, retrieveValue);
      if (!stored) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json(stored);
    });
  } catch (error) {
    if (error instanceof CloudflareKVError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('key');

  if (!keyId) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
  }

  try {
    return await withLocalKeyOperationQueue(keyId, async () => {
      await deleteValue(keyId, request.url);
      return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (error instanceof CloudflareKVError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
