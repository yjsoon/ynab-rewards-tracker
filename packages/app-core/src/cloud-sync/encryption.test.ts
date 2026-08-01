import { webcrypto } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  computeKeyId,
  decryptJson,
  encryptJsonWithIv,
  fromBase64Url,
  isValidMnemonic,
  normaliseMnemonic,
  toBase64Url,
} from './index';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const salt = new TextEncoder().encode('ynab-rewards-cloud-sync-v1');

async function encryptWithWebCrypto(data: unknown, iv: Uint8Array) {
  const encoder = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(mnemonic),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const key = await webcrypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoder.encode(JSON.stringify(data)),
  );
  return toBase64Url(new Uint8Array(encrypted));
}

describe('cross-platform Cloud Sync encryption', () => {
  it('normalises and validates the existing 12-word recovery code format', async () => {
    const messy = `  Abandon  abandon\n${'abandon '.repeat(9)}about `;
    expect(normaliseMnemonic(messy)).toBe(mnemonic);
    expect(isValidMnemonic(messy)).toBe(true);
    await expect(computeKeyId(messy)).resolves.toBe(await computeKeyId(mnemonic));
  });

  it('uses base64url without relying on browser globals', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it('matches the web WebCrypto AES-GCM wire format exactly', async () => {
    const payload = {
      cards: [{ id: 'card-1', type: 'miles', earningRate: 1.4 }],
      settings: { currency: 'SGD', milesValuation: 0.018 },
    };
    const iv = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const native = encryptJsonWithIv(mnemonic, payload, iv);
    const webCiphertext = await encryptWithWebCrypto(payload, iv);

    expect(native.ciphertext).toBe(webCiphertext);
    await expect(decryptJson<typeof payload>(mnemonic, webCiphertext, native.iv)).resolves.toEqual(payload);
  });

  it('rejects a wrong recovery code', async () => {
    const encrypted = encryptJsonWithIv(mnemonic, { secret: true }, new Uint8Array(12).fill(7));
    await expect(
      decryptJson(
        'legal winner thank year wave sausage worth useful legal winner thank yellow',
        encrypted.ciphertext,
        encrypted.iv,
      ),
    ).rejects.toThrow();
  });
});
