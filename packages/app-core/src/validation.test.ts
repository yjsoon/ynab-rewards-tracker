import { describe, it, expect } from 'vitest';
import { sanitizeInput, validateYnabToken, validateIssuer } from './validation';

describe('sanitizeInput', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('removes script tags', () => {
    expect(sanitizeInput('hello<script>alert("xss")</script>world')).toBe('helloworld');
  });

  it('removes iframe tags', () => {
    expect(sanitizeInput('hello<iframe src="evil.com"></iframe>world')).toBe('helloworld');
  });

  it('removes javascript: protocol', () => {
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
  });

  it('removes inline event handlers', () => {
    expect(sanitizeInput('onclick=alert(1)')).toBe('alert(1)');
    expect(sanitizeInput('onmouseover = doEvil()')).toBe('doEvil()');
  });

  it('removes arbitrary HTML tags', () => {
    expect(sanitizeInput('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeInput('<svg><animate onbegin=alert(1) /></svg>')).toBe('');
    expect(sanitizeInput('<b>Issuer</b>')).toBe('Issuer');
  });

  it('preserves safe content', () => {
    expect(sanitizeInput('Hello World')).toBe('Hello World');
    expect(sanitizeInput('Bank of America')).toBe('Bank of America');
  });
});

describe('validateYnabToken', () => {
  it('rejects empty token', () => {
    expect(validateYnabToken('')).toEqual({ valid: false, error: 'Token is required' });
  });

  it('rejects short token', () => {
    expect(validateYnabToken('abc123')).toEqual({ valid: false, error: 'Token appears to be too short' });
  });

  it('rejects token with invalid characters', () => {
    expect(validateYnabToken('abcdefghij12345678901234567890!@#')).toEqual({
      valid: false,
      error: 'Token contains invalid characters',
    });
  });

  it('accepts valid token format', () => {
    expect(validateYnabToken('abcdefghij1234567890-ABCD')).toEqual({ valid: true });
  });

  it('accepts token with hyphens', () => {
    expect(validateYnabToken('abc-def-ghi-jkl-123456789')).toEqual({ valid: true });
  });
});

describe('validateIssuer', () => {
  it('rejects empty issuer', () => {
    expect(validateIssuer('')).toEqual({ valid: false, error: 'Issuer is required' });
  });

  it('rejects single character issuer', () => {
    expect(validateIssuer('A')).toEqual({ valid: false, error: 'Issuer must be at least 2 characters' });
  });

  it('rejects issuer over 100 characters', () => {
    const longIssuer = 'A'.repeat(101);
    expect(validateIssuer(longIssuer)).toEqual({ valid: false, error: 'Issuer must be 100 characters or less' });
  });

  it('accepts valid issuer', () => {
    expect(validateIssuer('Chase')).toEqual({ valid: true });
    expect(validateIssuer('Bank of America')).toEqual({ valid: true });
  });

  it('sanitizes input before validation', () => {
    // Script tag is removed, leaving empty string
    expect(validateIssuer('<script>evil</script>')).toEqual({ valid: false, error: 'Issuer is required' });
  });
});
