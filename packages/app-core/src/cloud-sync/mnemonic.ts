import { entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const DEFAULT_STRENGTH = 128;

export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure random generator unavailable');
  }

  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function normaliseMnemonic(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .join(' ');
}

export function createMnemonic(
  strength = DEFAULT_STRENGTH,
  randomBytes: RandomBytes = defaultRandomBytes,
): string {
  const entropyBytes = strength / 8;
  if (!Number.isInteger(entropyBytes) || strength % 32 !== 0) {
    throw new Error('Mnemonic strength must be a multiple of 32');
  }

  return entropyToMnemonic(randomBytes(entropyBytes), wordlist);
}

export function isValidMnemonic(phrase: string): boolean {
  try {
    return validateMnemonic(normaliseMnemonic(phrase), wordlist);
  } catch {
    return false;
  }
}
