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

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const message = await response.text();
  throw new Error(message || 'Cloud sync request failed');
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
