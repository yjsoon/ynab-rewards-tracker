import { beforeEach, describe, expect, it } from 'vitest';

import {
  cn,
  fromMilli,
  absFromMilli,
  formatDollars,
  formatCurrencyParts,
  isoDate,
  getErrorMessage,
} from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    expect(cn('foo', true && 'bar', 'baz')).toBe('foo bar baz');
  });

  it('merges Tailwind classes correctly', () => {
    // twMerge should handle conflicting Tailwind classes
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
    expect(cn(['foo', false && 'bar', 'baz'])).toBe('foo baz');
  });

  it('handles objects', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });

  it('handles complex combinations', () => {
    expect(cn('base', { active: true, disabled: false }, ['extra', 'classes'])).toBe(
      'base active extra classes'
    );
  });
});

describe('fromMilli', () => {
  it('converts milliunits to dollars', () => {
    expect(fromMilli(1000)).toBe(1);
    expect(fromMilli(5000)).toBe(5);
    expect(fromMilli(10000)).toBe(10);
  });

  it('handles decimal values', () => {
    expect(fromMilli(1500)).toBe(1.5);
    expect(fromMilli(2345)).toBe(2.345);
    expect(fromMilli(999)).toBe(0.999);
  });

  it('handles zero', () => {
    expect(fromMilli(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(fromMilli(-1000)).toBe(-1);
    expect(fromMilli(-5500)).toBe(-5.5);
  });

  it('handles large values', () => {
    expect(fromMilli(1000000)).toBe(1000);
    expect(fromMilli(123456789)).toBe(123456.789);
  });

  it('handles fractional milliunits', () => {
    expect(fromMilli(1234.5)).toBe(1.2345);
  });
});

describe('absFromMilli', () => {
  it('converts milliunits to absolute dollars', () => {
    expect(absFromMilli(1000)).toBe(1);
    expect(absFromMilli(5000)).toBe(5);
  });

  it('converts negative values to positive', () => {
    expect(absFromMilli(-1000)).toBe(1);
    expect(absFromMilli(-5500)).toBe(5.5);
  });

  it('handles zero', () => {
    expect(absFromMilli(0)).toBe(0);
  });

  it('handles large negative values', () => {
    expect(absFromMilli(-123456789)).toBe(123456.789);
  });

  it('always returns positive values', () => {
    const testValues = [-1000, -500, 0, 500, 1000];
    testValues.forEach(value => {
      expect(absFromMilli(value)).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('formatDollars', () => {
  beforeEach(() => {
    // Mock window and localStorage for SSR-safe tests
    if (typeof global.window === 'undefined') {
      // @ts-expect-error - Mocking window for tests
      global.window = {};
    }
  });

  it('formats whole dollar amounts', () => {
    const result = formatDollars(100, { currency: 'USD' });
    expect(result).toMatch(/100/);
    expect(result).toMatch(/\$/);
  });

  it('formats decimal amounts with 2 decimal places', () => {
    const result = formatDollars(123.45, { currency: 'USD' });
    expect(result).toMatch(/123\.45/);
  });

  it('formats zero', () => {
    const result = formatDollars(0, { currency: 'USD' });
    expect(result).toMatch(/0\.00/);
  });

  it('formats negative amounts', () => {
    const result = formatDollars(-50.5, { currency: 'USD' });
    expect(result).toContain('50.50');
    // Should contain minus sign or parentheses depending on locale
  });

  it('handles large amounts', () => {
    const result = formatDollars(1234567.89, { currency: 'USD' });
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('567');
    expect(result).toContain('89');
  });

  it('accepts custom locale', () => {
    const resultUS = formatDollars(1234.56, { currency: 'USD', locale: 'en-US' });
    const resultDE = formatDollars(1234.56, { currency: 'EUR', locale: 'de-DE' });

    expect(resultUS).toBeTruthy();
    expect(resultDE).toBeTruthy();
    // Different locales format differently, just ensure they don't throw
  });

  it('handles different currencies', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
    currencies.forEach(currency => {
      const result = formatDollars(100, { currency });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  it('handles small decimal values', () => {
    const result = formatDollars(0.01, { currency: 'USD' });
    expect(result).toMatch(/0\.01/);
  });

  it('rounds to 2 decimal places', () => {
    const result = formatDollars(123.456789, { currency: 'USD' });
    expect(result).toMatch(/123\.46/);
  });
});

describe('formatCurrencyParts', () => {
  it('returns an array of parts', () => {
    const parts = formatCurrencyParts(100, { currency: 'USD' });
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
  });

  it('includes currency symbol', () => {
    const parts = formatCurrencyParts(100, { currency: 'USD' });
    const hasCurrency = parts.some(part => part.type === 'currency');
    expect(hasCurrency).toBe(true);
  });

  it('includes integer part', () => {
    const parts = formatCurrencyParts(100, { currency: 'USD' });
    const hasInteger = parts.some(part => part.type === 'integer');
    expect(hasInteger).toBe(true);
  });

  it('includes decimal separator and fraction for decimal values', () => {
    const parts = formatCurrencyParts(123.45, { currency: 'USD' });
    const hasDecimal = parts.some(part => part.type === 'decimal');
    const hasFraction = parts.some(part => part.type === 'fraction');
    expect(hasDecimal || hasFraction).toBe(true);
  });

  it('handles zero', () => {
    const parts = formatCurrencyParts(0, { currency: 'USD' });
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
  });

  it('handles negative values', () => {
    const parts = formatCurrencyParts(-50, { currency: 'USD' });
    expect(Array.isArray(parts)).toBe(true);
    const hasMinusSign = parts.some(part => part.type === 'minusSign');
    expect(hasMinusSign).toBe(true);
  });

  it('handles large numbers with group separators', () => {
    const parts = formatCurrencyParts(1234567.89, { currency: 'USD' });
    const hasGroup = parts.some(part => part.type === 'group');
    expect(hasGroup).toBe(true);
  });
});

describe('isoDate', () => {
  it('formats date to YYYY-MM-DD', () => {
    const date = new Date('2024-01-15T12:30:45.000Z');
    const result = isoDate(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2024-01-15');
  });

  it('handles different dates', () => {
    const testDates = [
      { date: new Date('2023-12-31T23:59:59.999Z'), expected: '2023-12-31' },
      { date: new Date('2024-01-01T00:00:00.000Z'), expected: '2024-01-01' },
      { date: new Date('2024-06-15T12:00:00.000Z'), expected: '2024-06-15' },
    ];

    testDates.forEach(({ date, expected }) => {
      expect(isoDate(date)).toBe(expected);
    });
  });

  it('pads single-digit months and days with zero', () => {
    const date = new Date('2024-03-05T00:00:00.000Z');
    const result = isoDate(date);
    expect(result).toBe('2024-03-05');
  });

  it('handles leap year dates', () => {
    const date = new Date('2024-02-29T12:00:00.000Z');
    const result = isoDate(date);
    expect(result).toBe('2024-02-29');
  });

  it('handles end of year', () => {
    const date = new Date('2024-12-31T23:59:59.999Z');
    const result = isoDate(date);
    expect(result).toBe('2024-12-31');
  });

  it('handles beginning of year', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = isoDate(date);
    expect(result).toBe('2024-01-01');
  });

  it('returns consistent format regardless of time', () => {
    const dates = [
      new Date('2024-06-15T00:00:00.000Z'),
      new Date('2024-06-15T12:30:45.000Z'),
      new Date('2024-06-15T23:59:59.999Z'),
    ];

    dates.forEach(date => {
      expect(isoDate(date)).toBe('2024-06-15');
    });
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error objects', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('returns string errors directly', () => {
    expect(getErrorMessage('Error message')).toBe('Error message');
  });

  it('handles TypeError', () => {
    const error = new TypeError('Type error occurred');
    expect(getErrorMessage(error)).toBe('Type error occurred');
  });

  it('handles RangeError', () => {
    const error = new RangeError('Value out of range');
    expect(getErrorMessage(error)).toBe('Value out of range');
  });

  it('handles custom Error subclasses', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('Custom error message');
    expect(getErrorMessage(error)).toBe('Custom error message');
  });

  it('converts unknown types to string', () => {
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
    expect(getErrorMessage(123)).toBe('123');
    expect(getErrorMessage(true)).toBe('true');
  });

  it('handles objects without message property', () => {
    const obj = { code: 500, details: 'Server error' };
    const result = getErrorMessage(obj);
    expect(typeof result).toBe('string');
    expect(result).toContain('object');
  });

  it('handles arrays', () => {
    const arr = ['error1', 'error2'];
    const result = getErrorMessage(arr);
    expect(typeof result).toBe('string');
  });

  it('handles empty Error', () => {
    const error = new Error();
    expect(getErrorMessage(error)).toBe('');
  });

  it('handles Error with multiline message', () => {
    const error = new Error('Line 1\nLine 2\nLine 3');
    expect(getErrorMessage(error)).toBe('Line 1\nLine 2\nLine 3');
  });

  it('handles Error with special characters', () => {
    const error = new Error('Error: <script>alert("xss")</script>');
    expect(getErrorMessage(error)).toBe('Error: <script>alert("xss")</script>');
    // Note: This function doesn't sanitize - that's the caller's responsibility
  });
});
