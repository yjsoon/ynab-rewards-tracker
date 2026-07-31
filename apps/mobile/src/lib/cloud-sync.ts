import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  computeKeyId,
  createMnemonic,
  decryptJson,
  encryptJson,
  isValidMnemonic,
  normaliseMnemonic,
} from '@ynab-counter/app-core/cloud-sync';

const DEFAULT_CLOUD_SYNC_ENDPOINT = 'https://rewards.soon.sg/api/cloud-sync';
const CLOUD_SYNC_CODE_KEY = 'ynab_counter_cloud_sync_code';
const REQUEST_TIMEOUT_MS = 20_000;

export type CloudSyncMetadata = {
  updatedAt: string;
  version: number;
};

type CloudSyncDownload = CloudSyncMetadata & {
  ciphertext: string;
  iv: string;
};

export type RestoredCloudSettings<T> = CloudSyncMetadata & {
  keyId: string;
  phrase: string;
  data: T;
};

function endpoint(): string {
  const configured = process.env.EXPO_PUBLIC_CLOUD_SYNC_URL?.trim();
  return configured || DEFAULT_CLOUD_SYNC_ENDPOINT;
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Cloud Sync timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.status === 204 ? (undefined as T) : (await response.json()) as T;
  }

  const body = await response.text().catch(() => '');
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string') message = parsed.error;
  } catch {
    // Plain-text service errors are already useful.
  }

  throw new Error(message || `Cloud Sync failed (${response.status})`);
}

function validPhrase(input: string): string {
  const phrase = normaliseMnemonic(input);
  if (!isValidMnemonic(phrase)) {
    throw new Error('Invalid sync code. Check all 12 words and try again.');
  }
  return phrase;
}

export function generateCloudSyncCode(): string {
  return createMnemonic(128, (length) => Crypto.getRandomBytes(length));
}

export async function loadRememberedCloudSyncCode(): Promise<string | null> {
  return SecureStore.getItemAsync(CLOUD_SYNC_CODE_KEY);
}

export async function rememberCloudSyncCode(inputPhrase: string): Promise<string> {
  const phrase = validPhrase(inputPhrase);
  await SecureStore.setItemAsync(CLOUD_SYNC_CODE_KEY, phrase);
  return phrase;
}

export async function forgetCloudSyncCode(): Promise<void> {
  await SecureStore.deleteItemAsync(CLOUD_SYNC_CODE_KEY);
}

export async function saveSettingsToCloud<T>(
  inputPhrase: string,
  data: T,
): Promise<CloudSyncMetadata & { keyId: string; phrase: string }> {
  const phrase = validPhrase(inputPhrase);
  const keyId = await computeKeyId(phrase);
  const encrypted = await encryptJson(phrase, data, (length) => Crypto.getRandomBytes(length));
  const response = await request(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ keyId, ...encrypted }),
  });
  const metadata = await handleResponse<CloudSyncMetadata>(response);
  return { ...metadata, keyId, phrase };
}

export async function restoreSettingsFromCloud<T>(
  inputPhrase: string,
): Promise<RestoredCloudSettings<T>> {
  const phrase = validPhrase(inputPhrase);
  const keyId = await computeKeyId(phrase);
  const response = await request(`${endpoint()}?key=${encodeURIComponent(keyId)}`, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) {
    throw new Error('No cloud backup was found for this sync code.');
  }

  const stored = await handleResponse<CloudSyncDownload>(response);
  if (
    typeof stored?.ciphertext !== 'string' || stored.ciphertext.length === 0 ||
    typeof stored.iv !== 'string' || stored.iv.length === 0
  ) {
    throw new Error('Cloud Sync returned an unreadable backup.');
  }
  const data = await decryptJson<T>(phrase, stored.ciphertext, stored.iv);
  return { data, keyId, phrase, updatedAt: stored.updatedAt, version: stored.version };
}

export async function deleteSettingsFromCloud(inputPhrase: string): Promise<void> {
  const phrase = validPhrase(inputPhrase);
  const keyId = await computeKeyId(phrase);
  const response = await request(`${endpoint()}?key=${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  await handleResponse<unknown>(response);
}
