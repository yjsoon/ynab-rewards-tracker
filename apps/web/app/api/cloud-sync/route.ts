import { NextResponse } from 'next/server';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_KV_NAMESPACE_ID || !CLOUDFLARE_API_TOKEN) {
  console.warn('Cloud sync API environment variables are missing. Cloud sync will be disabled.');
}

const VERSION = 1;

interface CloudflareError {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

class CloudflareKVError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestCloudflareKV(key: string, init: RequestInit): Promise<Response> {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_KV_NAMESPACE_ID || !CLOUDFLARE_API_TOKEN) {
    return new Response('Cloud sync not configured', { status: 501 });
  }

  const endpoint = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(
      key
    )}`
  );

  const response = await fetch(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
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

async function storeValue(key: string, value: string): Promise<void> {
  const response = await requestCloudflareKV(key, {
    method: 'PUT',
    body: value,
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    let message = 'Failed to store cloud sync data';
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as CloudflareError;
        message = parsed?.errors?.[0]?.message || bodyText || message;
      } catch {
        message = bodyText;
      }
    }
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${message}`, response.status || 502);
  }
}

async function retrieveValue(key: string): Promise<string | null> {
  const response = await requestCloudflareKV(key, {
    method: 'GET',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${body || 'Failed to retrieve cloud sync data'}`, response.status || 502);
  }

  return response.text();
}

async function deleteValue(key: string): Promise<void> {
  const response = await requestCloudflareKV(key, {
    method: 'DELETE',
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${body || 'Failed to delete cloud sync data'}`, response.status || 502);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { keyId, ciphertext, iv } = body ?? {};

    if (typeof keyId !== 'string' || typeof ciphertext !== 'string' || typeof iv !== 'string') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const payload = JSON.stringify({ ciphertext, iv, version: VERSION, updatedAt });
    await storeValue(keyId, payload);

    return NextResponse.json({ updatedAt, version: VERSION });
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
    const stored = await retrieveValue(keyId);
    if (!stored) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = JSON.parse(stored) as { ciphertext: string; iv: string; version?: number; updatedAt?: string };
    return NextResponse.json({
      ciphertext: parsed.ciphertext,
      iv: parsed.iv,
      version: parsed.version ?? VERSION,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
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
    await deleteValue(keyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CloudflareKVError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
