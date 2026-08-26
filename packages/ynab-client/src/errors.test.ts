import { describe, expect, it } from 'vitest';

import { readYnabErrorMessage } from './errors';

describe('readYnabErrorMessage', () => {
  it('reads HowMuch and YNAB error.detail', () => {
    expect(readYnabErrorMessage({
      error: { id: '400', name: 'bad_request', detail: 'Category not found' },
    }, 'HTTP 400')).toBe('Category not found');
  });

  it('reads a string error from the web proxy', () => {
    expect(readYnabErrorMessage({ error: 'Failed to proxy request' }, 'HTTP 502'))
      .toBe('Failed to proxy request');
  });

  it('reads a top-level message', () => {
    expect(readYnabErrorMessage({ message: 'invalid token' }, 'HTTP 401')).toBe('invalid token');
  });

  it('parses a JSON string body', () => {
    expect(readYnabErrorMessage(
      JSON.stringify({ error: { detail: 'Plan not found' } }),
      'HTTP 404',
    )).toBe('Plan not found');
  });

  it('keeps non-JSON text', () => {
    expect(readYnabErrorMessage('<html>Bad Gateway</html>', 'HTTP 502'))
      .toBe('<html>Bad Gateway</html>');
  });

  it('falls back when the body is empty', () => {
    expect(readYnabErrorMessage('', 'HTTP 502')).toBe('HTTP 502');
    expect(readYnabErrorMessage(null, 'HTTP 500')).toBe('HTTP 500');
  });
});
