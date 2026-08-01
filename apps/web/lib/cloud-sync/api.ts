export interface EncryptedSyncPayload {
  keyId: string;
  ciphertext: string;
  iv: string;
  expectedUpdatedAt: string | null;
}

export interface CloudSyncMetadata {
  updatedAt: string;
  version: number;
}

export interface CloudSyncResponse extends CloudSyncMetadata {
  ciphertext: string;
  iv: string;
}

const CLOUD_SYNC_NOT_CONFIGURED_MESSAGE =
  'Cloud Sync is not configured for this environment. You can keep using this browser locally, or configure Cloudflare KV to enable backup and multi-device sync.';
const CLOUD_SYNC_SERVER_ERROR_MESSAGE = 'Cloud sync is temporarily unavailable. Please try again later.';
const CLOUD_SYNC_REQUEST_ERROR_MESSAGE = 'Cloud sync request failed. Please try again.';
const MAX_CLOUD_SYNC_ERROR_LENGTH = 500;
const HTML_PATTERN = /<\s*(?:!doctype|\/?\s*[a-z])[^>]*>/i;
const ENCODED_HTML_PATTERN = /(?:&(?:lt|#0*60|#x0*3c);|%3c)/i;

function isSafeApplicationError(message: string): boolean {
  return (
    message.length > 0 &&
    message.length <= MAX_CLOUD_SYNC_ERROR_LENGTH &&
    !HTML_PATTERN.test(message) &&
    !ENCODED_HTML_PATTERN.test(message)
  );
}

export function parseCloudSyncErrorMessage(status: number, body: string): string {
  const fallback = status >= 500 ? CLOUD_SYNC_SERVER_ERROR_MESSAGE : CLOUD_SYNC_REQUEST_ERROR_MESSAGE;

  if (status === 501 && body === 'Cloud sync not configured') {
    return CLOUD_SYNC_NOT_CONFIGURED_MESSAGE;
  }

  let parsedMessage: string | undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as { error?: unknown }).error === 'string'
    ) {
      parsedMessage = (parsed as { error: string }).error;
    }
  } catch {
    return fallback;
  }

  if (
    status === 501 &&
    (parsedMessage === 'Cloud sync not configured' ||
      parsedMessage === 'Cloudflare (501): Cloud sync not configured')
  ) {
    return CLOUD_SYNC_NOT_CONFIGURED_MESSAGE;
  }

  return parsedMessage && isSafeApplicationError(parsedMessage) ? parsedMessage : fallback;
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
