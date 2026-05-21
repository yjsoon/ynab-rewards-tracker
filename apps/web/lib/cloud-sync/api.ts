export interface EncryptedSyncPayload {
  keyId: string;
  ciphertext: string;
  iv: string;
}

export interface CloudSyncMetadata {
  updatedAt: string;
  version: number;
}

export interface CloudSyncResponse extends CloudSyncMetadata {
  ciphertext: string;
  iv: string;
}

export function parseCloudSyncErrorMessage(status: number, body: string): string {
  let parsedMessage = body;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string') {
      parsedMessage = parsed.error;
    }
  } catch {
    // Non-JSON error responses are already readable.
  }

  if (status === 501 && parsedMessage.includes('Cloud sync not configured')) {
    return 'Cloud Sync is not configured for this environment. You can keep using this browser locally, or configure Cloudflare KV to enable backup and multi-device sync.';
  }

  return parsedMessage || 'Cloud sync request failed';
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const message = await response.text();
  throw new Error(parseCloudSyncErrorMessage(response.status, message));
}

export async function uploadEncryptedSettings(payload: EncryptedSyncPayload): Promise<CloudSyncMetadata> {
  const response = await fetch('/api/cloud-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return handleResponse<CloudSyncMetadata>(response);
}

export async function fetchEncryptedSettings(keyId: string): Promise<CloudSyncResponse | null> {
  const response = await fetch(`/api/cloud-sync?key=${encodeURIComponent(keyId)}`, {
    method: 'GET',
  });

  if (response.status === 404) {
    return null;
  }

  return handleResponse<CloudSyncResponse>(response);
}

export async function deleteEncryptedSettings(keyId: string): Promise<void> {
  const response = await fetch(`/api/cloud-sync?key=${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });

  await handleResponse<undefined>(response);
}
