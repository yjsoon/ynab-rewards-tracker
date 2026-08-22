import { describe, expect, it } from 'vitest';

import { parseCategoryImportSource } from './source';

describe('parseCategoryImportSource', () => {
  it('accepts instructions only', () => {
    expect(parseCategoryImportSource({ instructions: '  4 miles on dining  ' })).toEqual({
      kind: 'ok',
      source: { kind: 'instructions', instructions: '4 miles on dining' },
    });
  });

  it('accepts a public terms URL', () => {
    expect(parseCategoryImportSource({ termsUrl: 'https://bank.example/terms' })).toEqual({
      kind: 'ok',
      source: { kind: 'termsUrl', url: 'https://bank.example/terms' },
    });
  });

  it('accepts both instructions and a URL', () => {
    const result = parseCategoryImportSource({
      instructions: 'Keep petrol at 4%',
      termsUrl: 'https://bank.example/terms',
    });
    expect(result).toMatchObject({
      kind: 'ok',
      source: { kind: 'both', instructions: 'Keep petrol at 4%' },
    });
  });

  it('rejects an empty brief', () => {
    expect(parseCategoryImportSource({})).toEqual({
      kind: 'missing_source',
      message: 'Enter instructions or a terms link.',
    });
  });

  it('rejects javascript URLs, loopback hosts, and userinfo', () => {
    expect(parseCategoryImportSource({ termsUrl: 'javascript:alert(1)' }).kind).toBe('invalid_url');
    expect(parseCategoryImportSource({ termsUrl: 'http://127.0.0.1/terms' }).kind).toBe('invalid_url');
    expect(parseCategoryImportSource({ termsUrl: 'http://user:pass@example.com/terms' }).kind).toBe('invalid_url');
    expect(parseCategoryImportSource({ termsUrl: 'http://192.168.0.4/terms' }).kind).toBe('invalid_url');
  });
});
