import { describe, expect, it } from 'vitest';

import {
  sanitizeInput,
  validateYnabToken,
  validateIssuer,
} from './validation';

describe('sanitizeInput', () => {
  it('removes script tags', () => {
    const input = 'Hello <script>alert("XSS")</script> World';
    expect(sanitizeInput(input)).toBe('Hello  World');
  });

  it('removes multiple script tags', () => {
    const input = '<script>bad()</script>Text<script>worse()</script>';
    expect(sanitizeInput(input)).toBe('Text');
  });

  it('removes iframe tags', () => {
    const input = 'Content <iframe src="evil.com"></iframe> here';
    expect(sanitizeInput(input)).toBe('Content  here');
  });

  it('removes javascript: protocol', () => {
    const input = 'javascript:alert(1)';
    const result = sanitizeInput(input);
    // The function removes "javascript:" completely (including the colon)
    expect(result).toBe('alert(1)');
    expect(result).not.toContain('javascript');

    const inputWithTag = '<a href="javascript:alert(1)">Click</a>';
    const resultWithTag = sanitizeInput(inputWithTag);
    expect(resultWithTag).toContain('Click');
    expect(resultWithTag).not.toContain('javascript:');
  });

  it('removes event handlers (onclick, onload, etc)', () => {
    expect(sanitizeInput('Text onclick="bad()"')).toBe('Text "bad()"');
    expect(sanitizeInput('Text onload="bad()"')).toBe('Text "bad()"');
    expect(sanitizeInput('Text onmouseover="bad()"')).toBe('Text "bad()"');
    expect(sanitizeInput('Text onerror="bad()"')).toBe('Text "bad()"');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  Hello World  ')).toBe('Hello World');
  });

  it('handles empty strings', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('handles null/undefined input gracefully', () => {
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });

  it('preserves safe HTML entities', () => {
    const input = 'Price: &pound;50 &amp; &euro;60';
    expect(sanitizeInput(input)).toBe('Price: &pound;50 &amp; &euro;60');
  });

  it('handles nested script tags', () => {
    const input = '<script><script>alert("nested")</script></script>';
    // Regex-based sanitization may not perfectly handle nested tags
    const result = sanitizeInput(input);
    expect(result.includes('alert')).toBe(false);
  });

  it('handles case variations in dangerous tags', () => {
    expect(sanitizeInput('<SCRIPT>bad()</SCRIPT>')).toBe('');
    expect(sanitizeInput('<ScRiPt>bad()</sCrIpT>')).toBe('');
    expect(sanitizeInput('<IFRAME>bad</IFRAME>')).toBe('');
  });

  it('handles case variations in javascript protocol', () => {
    // The regex replaces 'javascript:' case-insensitively (completely removes it including colon)
    expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
    expect(sanitizeInput('JAVASCRIPT:alert(1)')).toBe('alert(1)');
    expect(sanitizeInput('JaVaScRiPt:alert(1)')).toBe('alert(1)');
  });
});

describe('validateYnabToken', () => {
  it('accepts valid token format', () => {
    const token = 'abc123-def456-ghi789-jkl012-mno345-pqr678-stu901-vwx234-yz';
    const result = validateYnabToken(token);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects empty token', () => {
    const result = validateYnabToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token is required');
  });

  it('rejects token that is too short', () => {
    const result = validateYnabToken('abc123');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token appears to be too short');
  });

  it('accepts tokens with 20 or more characters', () => {
    const token = '12345678901234567890'; // exactly 20 chars
    const result = validateYnabToken(token);
    expect(result.valid).toBe(true);
  });

  it('rejects tokens with invalid characters', () => {
    const invalidChars = [
      'abc123@def456',
      'abc123$def456',
      'abc123!def456',
      'abc123#def456',
      'abc123%def456',
      'abc123&def456',
      'abc123*def456',
      'abc123(def456)',
      'abc123 def456', // space
      'abc123_def456', // underscore
    ];

    invalidChars.forEach(token => {
      const result = validateYnabToken(token + '1234567890'); // Make it long enough
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token contains invalid characters');
    });
  });

  it('accepts tokens with alphanumeric and hyphens', () => {
    const validTokens = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789-0123456789',
      'abc-123-DEF-456-ghi-789',
    ];

    validTokens.forEach(token => {
      const result = validateYnabToken(token);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('handles realistic YNAB token format', () => {
    // Typical YNAB tokens are ~64 chars with alphanumeric and hyphens
    const token = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4';
    const result = validateYnabToken(token);
    expect(result.valid).toBe(true);
  });
});

describe('validateIssuer', () => {
  it('accepts valid issuer names', () => {
    const validIssuers = [
      'Chase',
      'American Express',
      'Capital One',
      'Bank of America',
    ];

    validIssuers.forEach(issuer => {
      const result = validateIssuer(issuer);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('rejects empty issuer', () => {
    const result = validateIssuer('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Issuer is required');
  });

  it('rejects whitespace-only issuer', () => {
    const result = validateIssuer('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Issuer is required');
  });

  it('rejects issuer that is too short', () => {
    const result = validateIssuer('A');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Issuer must be at least 2 characters');
  });

  it('accepts issuer with exactly 2 characters', () => {
    const result = validateIssuer('AB');
    expect(result.valid).toBe(true);
  });

  it('rejects issuer that is too long', () => {
    const longIssuer = 'A'.repeat(101);
    const result = validateIssuer(longIssuer);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Issuer must be 100 characters or less');
  });

  it('accepts issuer with exactly 100 characters', () => {
    const issuer = 'A'.repeat(100);
    const result = validateIssuer(issuer);
    expect(result.valid).toBe(true);
  });

  it('sanitizes dangerous input', () => {
    const result = validateIssuer('<iframe>evil</iframe>Chase Bank');
    expect(result.valid).toBe(true);
  });

  it('trims whitespace before validation', () => {
    const result = validateIssuer('  Chase Bank  ');
    expect(result.valid).toBe(true);
  });
});
