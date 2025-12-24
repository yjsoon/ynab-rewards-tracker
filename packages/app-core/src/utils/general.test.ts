import { describe, it, expect } from 'vitest';
import { fromMilli, absFromMilli, localIsoDate, isoDate, getErrorMessage } from './general';

describe('fromMilli', () => {
  it('converts positive milliunits to dollars', () => {
    expect(fromMilli(1000)).toBe(1);
    expect(fromMilli(1500)).toBe(1.5);
    expect(fromMilli(123456)).toBe(123.456);
  });

  it('converts negative milliunits to dollars', () => {
    expect(fromMilli(-1000)).toBe(-1);
    expect(fromMilli(-5000)).toBe(-5);
  });

  it('handles zero', () => {
    expect(fromMilli(0)).toBe(0);
  });
});

describe('absFromMilli', () => {
  it('converts positive milliunits to absolute dollars', () => {
    expect(absFromMilli(1000)).toBe(1);
    expect(absFromMilli(2500)).toBe(2.5);
  });

  it('converts negative milliunits to absolute dollars', () => {
    expect(absFromMilli(-1000)).toBe(1);
    expect(absFromMilli(-5000)).toBe(5);
  });

  it('handles zero', () => {
    expect(absFromMilli(0)).toBe(0);
  });
});

describe('localIsoDate', () => {
  it('formats date as YYYY-MM-DD using local timezone', () => {
    // Create date with specific local components
    const date = new Date(2024, 0, 15); // Jan 15, 2024 local
    expect(localIsoDate(date)).toBe('2024-01-15');
  });

  it('pads single-digit months and days', () => {
    const date = new Date(2024, 2, 5); // Mar 5, 2024 local
    expect(localIsoDate(date)).toBe('2024-03-05');
  });

  it('handles end of year', () => {
    const date = new Date(2024, 11, 31); // Dec 31, 2024 local
    expect(localIsoDate(date)).toBe('2024-12-31');
  });
});

describe('isoDate (deprecated)', () => {
  it('formats date as YYYY-MM-DD using UTC', () => {
    // Note: This test uses a midday UTC time to avoid timezone edge cases
    const date = new Date('2024-01-15T12:00:00Z');
    expect(isoDate(date)).toBe('2024-01-15');
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error object', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('returns string as-is', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('converts other types to string', () => {
    expect(getErrorMessage(123)).toBe('123');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
    expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]');
  });
});
