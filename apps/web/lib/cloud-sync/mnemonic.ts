import { entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const DEFAULT_STRENGTH = 128; // 12 words

function getRandomBytes(size: number): Uint8Array {
  const randomBytes = new Uint8Array(size);
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure random generator unavailable');
  }
  globalThis.crypto.getRandomValues(randomBytes);
  return randomBytes;
}

export function normaliseMnemonic(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .join(' ');
}

export function createMnemonic(strength: number = DEFAULT_STRENGTH): string {
  const entropyBytes = strength / 8;
  if (!Number.isInteger(entropyBytes)) {
    throw new Error('Mnemonic strength must be a multiple of 32');
  }
  const entropy = getRandomBytes(entropyBytes);
  return entropyToMnemonic(entropy, wordlist);
}

export function isValidMnemonic(phrase: string): boolean {
  try {
    return validateMnemonic(normaliseMnemonic(phrase), wordlist);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to validate mnemonic:', error);
    }
    return false;
  }
}
