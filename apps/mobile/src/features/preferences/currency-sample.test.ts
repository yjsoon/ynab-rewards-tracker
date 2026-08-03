import { describe, expect, it } from 'vitest';

import { MAX_MILES_VALUATION, formatMilesValueSample } from './currency-sample';

describe('formatMilesValueSample', () => {
  it('uses the narrow currency symbol for USD in locales that would otherwise show US$', () => {
    expect(formatMilesValueSample('USD', '1', 'en-SG')).toBe('$1,000.00');
  });

  it('leaves a non-USD currency symbol alone', () => {
    expect(formatMilesValueSample('EUR', '0.01', 'en-GB')).toBe('€10.00');
  });

  it('accepts a lowercase code and surrounding whitespace', () => {
    expect(formatMilesValueSample('  usd  ', ' 1 ', 'en-SG')).toBe('$1,000.00');
  });

  it('falls back to the device locale when none is given', () => {
    expect(formatMilesValueSample('USD', '1')).toContain('$');
  });

  it('rejects a miles value with trailing characters rather than reading its prefix', () => {
    expect(formatMilesValueSample('USD', '1abc', 'en-SG')).toBeUndefined();
  });

  it.each(['', '   ', 'abc', 'NaN', 'Infinity', '-1', '1e3', '1.2.3'])(
    'rejects the non-numeric miles value %j',
    (value) => {
      expect(formatMilesValueSample('USD', value, 'en-SG')).toBeUndefined();
    },
  );

  it('rejects miles values above the maximum the screen will save', () => {
    expect(formatMilesValueSample('USD', String(MAX_MILES_VALUATION), 'en-SG')).toBeDefined();
    expect(formatMilesValueSample('USD', String(MAX_MILES_VALUATION + 1), 'en-SG')).toBeUndefined();
  });

  it.each(['US', 'USDD', 'U5D', '$', ''])('rejects the malformed currency %j', (currency) => {
    expect(formatMilesValueSample(currency, '1', 'en-SG')).toBeUndefined();
  });

  it('rejects an ISO-shaped but unsupported code instead of falling back to USD', () => {
    expect(formatMilesValueSample('FOO', '1', 'en-SG')).toBeUndefined();
  });
});
