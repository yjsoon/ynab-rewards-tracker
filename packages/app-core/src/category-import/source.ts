import type { CategoryImportFailure, CategoryImportSource } from './types';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google.com',
]);

export type CategoryImportSourceResult =
  | { kind: 'ok'; source: CategoryImportSource }
  | Extract<CategoryImportFailure, { kind: 'missing_source' | 'invalid_url' }>;

export function parseCategoryImportSource(input: {
  instructions?: string | null;
  termsUrl?: string | null;
  url?: string | null;
}): CategoryImportSourceResult {
  const instructions = input.instructions?.trim() ?? '';
  const url = (input.url ?? input.termsUrl)?.trim() ?? '';

  if (!instructions && !url) {
    return {
      kind: 'missing_source',
      message: 'Enter instructions or a terms URL.',
    };
  }

  if (url) {
    const urlError = validatePublicHttpUrl(url);
    if (urlError) {
      return urlError;
    }
  }

  if (instructions && url) {
    return { kind: 'ok', source: { kind: 'both', instructions, url } };
  }
  if (url) {
    return { kind: 'ok', source: { kind: 'termsUrl', url } };
  }
  return { kind: 'ok', source: { kind: 'instructions', instructions } };
}

export function validatePublicHttpUrl(
  value: string,
): Extract<CategoryImportFailure, { kind: 'invalid_url' }> | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { kind: 'invalid_url', message: 'That link is not a public web address.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'invalid_url', message: 'That link is not a public web address.' };
  }
  if (parsed.username || parsed.password) {
    return { kind: 'invalid_url', message: 'That link is not a public web address.' };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (
    !hostname
    || BLOCKED_HOSTS.has(hostname)
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || isPrivateHostname(hostname)
  ) {
    return { kind: 'invalid_url', message: 'That link is not a public web address.' };
  }

  return null;
}

function isPrivateHostname(hostname: string): boolean {
  if (hostname === '::' || hostname === '::1' || hostname === '0.0.0.0') {
    return true;
  }
  if (hostname.includes(':')) {
    return (
      /^f[cd]/i.test(hostname)
      || /^fe[89ab]/i.test(hostname)
      || hostname.startsWith('::ffff:')
    );
  }

  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  return false;
}
