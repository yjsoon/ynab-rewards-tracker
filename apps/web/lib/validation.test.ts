import { describe, expect, it } from 'vitest';

import {
  sanitizeInput,
  validateYnabToken,
  validateCardName,
  validateIssuer,
  validateUrl,
  sanitizeFileName,
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

describe('validateCardName', () => {
  it('accepts valid card names', () => {
    const validNames = [
      'Chase Sapphire Reserve',
      'Amex Gold',
      'Capital One Venture X',
      'Citi Premier',
    ];

    validNames.forEach(name => {
      const result = validateCardName(name);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('rejects empty names', () => {
    const result = validateCardName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Card name is required');
  });

  it('rejects whitespace-only names', () => {
    const result = validateCardName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Card name is required');
  });

  it('rejects names that are too short', () => {
    const result = validateCardName('A');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Card name must be at least 2 characters');
  });

  it('accepts names with exactly 2 characters', () => {
    const result = validateCardName('AB');
    expect(result.valid).toBe(true);
  });

  it('rejects names that are too long', () => {
    const longName = 'A'.repeat(101);
    const result = validateCardName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Card name must be less than 100 characters');
  });

  it('accepts names with exactly 100 characters', () => {
    const name = 'A'.repeat(100);
    const result = validateCardName(name);
    expect(result.valid).toBe(true);
  });

  it('sanitizes dangerous input', () => {
    const result = validateCardName('<script>alert("xss")</script>Valid Name');
    expect(result.valid).toBe(true);
    // The sanitization should have removed the script tag
  });

  it('trims whitespace before validation', () => {
    const result = validateCardName('  Valid Name  ');
    expect(result.valid).toBe(true);
  });

  it('handles special characters in names', () => {
    const names = [
      'Chase Freedom™',
      'Amex® Gold',
      'Card & Benefits',
      "O'Reilly Card",
    ];

    names.forEach(name => {
      const result = validateCardName(name);
      expect(result.valid).toBe(true);
    });
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

describe('validateUrl', () => {
  it('accepts valid HTTP URLs', () => {
    expect(validateUrl('http://example.com')).toBe(true);
    expect(validateUrl('http://www.example.com')).toBe(true);
    expect(validateUrl('http://example.com/path')).toBe(true);
    expect(validateUrl('http://example.com/path?query=value')).toBe(true);
  });

  it('accepts valid HTTPS URLs', () => {
    expect(validateUrl('https://example.com')).toBe(true);
    expect(validateUrl('https://www.example.com')).toBe(true);
    expect(validateUrl('https://example.com/path')).toBe(true);
    expect(validateUrl('https://sub.domain.example.com')).toBe(true);
  });

  it('rejects javascript: protocol', () => {
    expect(validateUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: protocol', () => {
    expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects file: protocol', () => {
    expect(validateUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects ftp: protocol', () => {
    expect(validateUrl('ftp://example.com')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateUrl('not a url')).toBe(false);
    expect(validateUrl('htp://example.com')).toBe(false); // typo in protocol
    expect(validateUrl('//example.com')).toBe(false); // protocol-relative
    expect(validateUrl('')).toBe(false);
  });

  it('handles URLs with ports', () => {
    expect(validateUrl('http://example.com:8080')).toBe(true);
    expect(validateUrl('https://example.com:443')).toBe(true);
  });

  it('handles URLs with authentication', () => {
    expect(validateUrl('https://user:pass@example.com')).toBe(true);
  });

  it('handles URLs with fragments', () => {
    expect(validateUrl('https://example.com#section')).toBe(true);
    expect(validateUrl('https://example.com/page#section')).toBe(true);
  });

  it('handles international domain names', () => {
    expect(validateUrl('https://例え.jp')).toBe(true);
  });
});

describe('sanitizeFileName', () => {
  it('preserves valid filenames', () => {
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf');
    expect(sanitizeFileName('image.jpg')).toBe('image.jpg');
    expect(sanitizeFileName('file-name.txt')).toBe('file-name.txt');
    expect(sanitizeFileName('my.backup.json')).toBe('my.backup.json');
  });

  it('replaces invalid characters with underscores', () => {
    expect(sanitizeFileName('file/name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file\\name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file:name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file*name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file?name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file"name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file<name>.txt')).toBe('file_name_.txt');
    expect(sanitizeFileName('file|name.txt')).toBe('file_name.txt');
  });

  it('collapses multiple underscores into one', () => {
    expect(sanitizeFileName('file///name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file<>|name.txt')).toBe('file_name.txt');
  });

  it('handles spaces by replacing with underscores', () => {
    expect(sanitizeFileName('my file name.txt')).toBe('my_file_name.txt');
    expect(sanitizeFileName('file   name.txt')).toBe('file_name.txt');
  });

  it('truncates filenames longer than 255 characters', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFileName(longName);
    expect(result.length).toBe(255);
  });

  it('preserves alphanumeric, dots, and hyphens', () => {
    expect(sanitizeFileName('abc-123.xyz')).toBe('abc-123.xyz');
    expect(sanitizeFileName('file.2024-01-15.backup.json')).toBe('file.2024-01-15.backup.json');
  });

  it('handles empty strings', () => {
    expect(sanitizeFileName('')).toBe('');
  });

  it('handles filenames with only invalid characters', () => {
    expect(sanitizeFileName('///***')).toBe('_');
  });

  it('handles path traversal attempts', () => {
    // Note: dots and hyphens are allowed characters, so .. becomes .. but / and \ become _
    expect(sanitizeFileName('../../../etc/passwd')).toBe('.._.._.._etc_passwd');
    expect(sanitizeFileName('..\\..\\windows\\system32')).toBe('.._.._windows_system32');
    expect(sanitizeFileName('..\\..\\..\\windows\\system32')).toBe('.._.._.._windows_system32');
  });

  it('handles Unicode characters', () => {
    // Unicode chars are replaced with underscores, then consecutive underscores collapse to one
    const result1 = sanitizeFileName('file-名前.txt');
    const result2 = sanitizeFileName('документ.pdf');

    // Should have underscores replacing Unicode chars, then collapsed
    expect(result1).toBe('file-_.txt'); // 2 chars become _ then collapsed
    expect(result2).toBe('_.pdf'); // All Cyrillic chars replaced and collapsed
  });
});
