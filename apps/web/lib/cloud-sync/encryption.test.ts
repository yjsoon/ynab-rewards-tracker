import { beforeAll, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';

import {
  computeKeyId,
  decryptJson,
  encryptJson,
  isValidMnemonic,
  normaliseMnemonic,
} from '@/lib/cloud-sync';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  }

  if (typeof globalThis.atob !== 'function') {
    Object.defineProperty(globalThis, 'atob', {
      value: (input: string) => Buffer.from(input, 'base64').toString('binary'),
      configurable: true,
    });
  }

  if (typeof globalThis.btoa !== 'function') {
    Object.defineProperty(globalThis, 'btoa', {
      value: (input: string) => Buffer.from(input, 'binary').toString('base64'),
      configurable: true,
    });
  }
});

describe('cloud sync encryption helpers', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('normalises phrases and derives stable key ids', async () => {
    const messy = '  Abandon   ABANDON   abandon\n    Abandon   abandon  abandon   abandon   abandon   abandon   Abandon   abandon   about ';

    const normalised = normaliseMnemonic(messy);
    expect(normalised).toBe(mnemonic);
    expect(isValidMnemonic(normalised)).toBe(true);

    const [idA, idB] = await Promise.all([
      computeKeyId(mnemonic),
      computeKeyId(messy),
    ]);

    expect(idA).toBe(idB);
  });

  it('encrypts and decrypts payloads symmetrically', async () => {
    const payload = {
      cards: [{ id: 'test-card', name: 'Test Card' }],
      settings: { currency: 'USD', milesValuation: 0.0125 },
    };

    const encrypted = await encryptJson(mnemonic, payload);
    expect(encrypted.ciphertext).toBeTypeOf('string');
    expect(encrypted.iv).toBeTypeOf('string');

    const decrypted = await decryptJson<typeof payload>(mnemonic, encrypted.ciphertext, encrypted.iv);
    expect(decrypted).toEqual(payload);
  });

  it('rejects decryption with the wrong mnemonic', async () => {
    const payload = { foo: 'bar' };
    const encrypted = await encryptJson(mnemonic, payload);

    await expect(
      decryptJson('legal winner thank year wave sausage worth useful legal winner thank yellow', encrypted.ciphertext, encrypted.iv)
    ).rejects.toThrow();
  });
});
