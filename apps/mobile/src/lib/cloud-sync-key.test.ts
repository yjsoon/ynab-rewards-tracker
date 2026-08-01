import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeAes = vi.hoisted(() => ({
  available: true,
  pbkdf2: vi.fn(),
}));

vi.mock('react-native-aes-crypto', () => ({
  default: {
    get pbkdf2() {
      return nativeAes.available ? nativeAes.pbkdf2 : undefined;
    },
  },
}));

import {
  CLOUD_SYNC_KEY_LENGTH_BITS,
  CLOUD_SYNC_PBKDF2_ITERATIONS,
  CLOUD_SYNC_PBKDF2_SALT,
  deriveCloudSyncKey,
  encryptJson,
  encryptJsonWithIv,
} from '@ynab-counter/app-core/cloud-sync';
import { deriveCloudSyncKeyNative } from './cloud-sync-key';

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

beforeEach(() => {
  nativeAes.available = true;
  nativeAes.pbkdf2.mockReset();
});

describe('native Cloud Sync key derivation', () => {
  it('preserves the existing cross-platform ciphertext wire format', async () => {
    nativeAes.pbkdf2.mockResolvedValue(toHex(deriveCloudSyncKey(mnemonic)));
    const iv = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const payload = { cards: [{ id: 'card-1' }], settings: { currency: 'SGD' } };

    const native = await encryptJson(mnemonic, payload, () => iv, deriveCloudSyncKeyNative);
    const reference = encryptJsonWithIv(mnemonic, payload, iv);

    expect(native).toEqual(reference);
    expect(nativeAes.pbkdf2).toHaveBeenCalledWith(
      mnemonic,
      CLOUD_SYNC_PBKDF2_SALT,
      CLOUD_SYNC_PBKDF2_ITERATIONS,
      CLOUD_SYNC_KEY_LENGTH_BITS,
      'sha256',
    );
  });

  it('returns control while the native worker derives the key', async () => {
    let release!: (hex: string) => void;
    nativeAes.pbkdf2.mockImplementation(() => new Promise<string>((resolve) => {
      release = resolve;
    }));

    let settled = false;
    const derivation = deriveCloudSyncKeyNative(mnemonic).finally(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    release(toHex(deriveCloudSyncKey(mnemonic)));
    await expect(derivation).resolves.toEqual(deriveCloudSyncKey(mnemonic));
  });

  it('falls back cooperatively in Expo Go without changing the derived key', async () => {
    nativeAes.available = false;

    let settled = false;
    const derivation = deriveCloudSyncKeyNative(mnemonic).finally(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    await expect(derivation).resolves.toEqual(deriveCloudSyncKey(mnemonic));
    expect(nativeAes.pbkdf2).not.toHaveBeenCalled();
  });
});
