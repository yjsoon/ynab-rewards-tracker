import Aes from 'react-native-aes-crypto';

import {
  CLOUD_SYNC_KEY_LENGTH_BITS,
  CLOUD_SYNC_PBKDF2_ITERATIONS,
  CLOUD_SYNC_PBKDF2_SALT,
  deriveCloudSyncKeyAsync,
  normaliseMnemonic,
} from '@ynab-counter/app-core/cloud-sync';

function hexToBytes(hex: string): Uint8Array {
  if (hex.length !== CLOUD_SYNC_KEY_LENGTH_BITS / 4 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Native PBKDF2 returned an invalid Cloud Sync key.');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Prefer platform PBKDF2, with a cooperative JS fallback for Expo Go. */
export async function deriveCloudSyncKeyNative(mnemonic: string): Promise<Uint8Array> {
  if (typeof Aes?.pbkdf2 !== 'function') {
    return deriveCloudSyncKeyAsync(mnemonic);
  }

  const hex = await Aes.pbkdf2(
    normaliseMnemonic(mnemonic),
    CLOUD_SYNC_PBKDF2_SALT,
    CLOUD_SYNC_PBKDF2_ITERATIONS,
    CLOUD_SYNC_KEY_LENGTH_BITS,
    'sha256',
  );
  return hexToBytes(hex);
}
