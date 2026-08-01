import { gcm } from '@noble/ciphers/aes';
import { pbkdf2, pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { normaliseMnemonic, type RandomBytes } from './mnemonic';

export const CLOUD_SYNC_PBKDF2_SALT = 'ynab-rewards-cloud-sync-v1';
export const CLOUD_SYNC_PBKDF2_ITERATIONS = 210_000;
export const CLOUD_SYNC_KEY_LENGTH_BITS = 256;
const KEY_ID_PREFIX = 'ynab-rewards-key:';
const KEY_LENGTH_BYTES = CLOUD_SYNC_KEY_LENGTH_BITS / 8;
const IV_LENGTH_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type EncryptedJson = {
  ciphertext: string;
  iv: string;
};

function defaultRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure random generator unavailable');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export type CloudSyncKeyDeriver = (mnemonic: string) => Promise<Uint8Array>;

export function deriveCloudSyncKey(mnemonic: string): Uint8Array {
  return pbkdf2(
    sha256,
    encoder.encode(normaliseMnemonic(mnemonic)),
    encoder.encode(CLOUD_SYNC_PBKDF2_SALT),
    { c: CLOUD_SYNC_PBKDF2_ITERATIONS, dkLen: KEY_LENGTH_BYTES },
  );
}

/** Cooperative JS fallback for runtimes, such as Expo Go, without native PBKDF2. */
export function deriveCloudSyncKeyAsync(mnemonic: string): Promise<Uint8Array> {
  return pbkdf2Async(
    sha256,
    encoder.encode(normaliseMnemonic(mnemonic)),
    encoder.encode(CLOUD_SYNC_PBKDF2_SALT),
    {
      c: CLOUD_SYNC_PBKDF2_ITERATIONS,
      dkLen: KEY_LENGTH_BYTES,
      asyncTick: 10,
    },
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;

    output += BASE64_ALPHABET[(combined >>> 18) & 63];
    output += BASE64_ALPHABET[(combined >>> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(combined >>> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : '=';
  }
  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 payload');
  }

  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding);
  let cursor = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const values = [0, 1, 2, 3].map((offset) => {
      const character = clean[index + offset];
      if (character === '=') return 0;
      const decoded = BASE64_ALPHABET.indexOf(character);
      if (decoded < 0) throw new Error('Invalid base64 payload');
      return decoded;
    });
    const combined = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];

    if (cursor < bytes.length) bytes[cursor++] = (combined >>> 16) & 255;
    if (cursor < bytes.length) bytes[cursor++] = (combined >>> 8) & 255;
    if (cursor < bytes.length) bytes[cursor++] = combined & 255;
  }

  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return base64ToBytes(padded);
}

export async function computeKeyId(mnemonic: string): Promise<string> {
  return toBase64Url(sha256(encoder.encode(`${KEY_ID_PREFIX}${normaliseMnemonic(mnemonic)}`)));
}

export function encryptJsonWithIv<T>(mnemonic: string, data: T, iv: Uint8Array): EncryptedJson {
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`Cloud Sync requires a ${IV_LENGTH_BYTES}-byte IV`);
  }

  const encrypted = gcm(deriveCloudSyncKey(mnemonic), iv).encrypt(encoder.encode(JSON.stringify(data)));
  return {
    ciphertext: toBase64Url(encrypted),
    iv: toBase64Url(iv),
  };
}

export async function encryptJson<T>(
  mnemonic: string,
  data: T,
  randomBytes: RandomBytes = defaultRandomBytes,
  deriveKey: CloudSyncKeyDeriver = async (value) => deriveCloudSyncKey(value),
): Promise<EncryptedJson> {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const encrypted = gcm(await deriveKey(mnemonic), iv)
    .encrypt(encoder.encode(JSON.stringify(data)));
  return {
    ciphertext: toBase64Url(encrypted),
    iv: toBase64Url(iv),
  };
}

export async function decryptJson<T>(
  mnemonic: string,
  ciphertext: string,
  iv: string,
  deriveKey: CloudSyncKeyDeriver = async (value) => deriveCloudSyncKey(value),
): Promise<T> {
  const nonce = fromBase64Url(iv);
  if (nonce.length !== IV_LENGTH_BYTES) {
    throw new Error('Invalid Cloud Sync IV');
  }

  const decrypted = gcm(await deriveKey(mnemonic), nonce).decrypt(fromBase64Url(ciphertext));
  return JSON.parse(decoder.decode(decrypted)) as T;
}
