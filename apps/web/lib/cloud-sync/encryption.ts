import { normaliseMnemonic } from './mnemonic';

const SALT = 'ynab-rewards-cloud-sync-v1';
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = 'SHA-256';
const AES_ALGO = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type BufferLike = Uint8Array & { toString(encoding: string): string };
type BufferConstructorLike = {
  from(data: Uint8Array | string, encoding?: string): BufferLike;
};

function ensureCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API not available in this environment');
  }
  return globalThis.crypto;
}

function getNodeBuffer(): BufferConstructorLike | undefined {
  if (!('Buffer' in globalThis)) {
    return undefined;
  }

  const candidate = (globalThis as typeof globalThis & { Buffer?: unknown }).Buffer;
  return typeof candidate === 'function' ? (candidate as BufferConstructorLike) : undefined;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  if (typeof globalThis.btoa === 'function') {
    const base64 = globalThis.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  const nodeBuffer = getNodeBuffer();
  if (nodeBuffer) {
    return nodeBuffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  throw new Error('No base64 encoder available');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);

  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const nodeBuffer = getNodeBuffer();
  if (nodeBuffer) {
    return nodeBuffer.from(padded, 'base64');
  }

  throw new Error('No base64 decoder available');
}

async function deriveKey(mnemonic: string): Promise<CryptoKey> {
  const crypto = ensureCrypto();
  const normalised = normaliseMnemonic(mnemonic);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(normalised),
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: AES_ALGO, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function computeKeyId(mnemonic: string): Promise<string> {
  const crypto = ensureCrypto();
  const normalised = normaliseMnemonic(mnemonic);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(`ynab-rewards-key:${normalised}`)
  );
  return toBase64Url(digest);
}

export async function encryptJson<T>(mnemonic: string, data: T): Promise<{ ciphertext: string; iv: string }> {
  const crypto = ensureCrypto();
  const key = await deriveKey(mnemonic);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const payload = textEncoder.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, key, payload);

  return {
    ciphertext: toBase64Url(encrypted),
    iv: toBase64Url(iv.buffer),
  };
}

export async function decryptJson<T>(mnemonic: string, ciphertext: string, iv: string): Promise<T> {
  const crypto = ensureCrypto();
  const key = await deriveKey(mnemonic);
  const payload = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext)
  );

  const decoded = textDecoder.decode(payload);
  return JSON.parse(decoded) as T;
}

export function getBase64UrlFromBuffer(buffer: ArrayBuffer): string {
  return toBase64Url(buffer);
}

export function getBufferFromBase64Url(value: string): Uint8Array {
  return fromBase64Url(value);
}
