import { describe, it, expect } from 'vitest';
import {
  applyCurrencySymbolOverride,
  createCurrencyFormatter,
  formatCurrency,
  formatCurrencyParts,
  normalizeCurrencyCode,
} from './currency';

describe('createCurrencyFormatter', () => {
  it('creates a formatter with default 2 decimals', () => {
    const formatter = createCurrencyFormatter({ locale: 'en-US', currency: 'USD' });
    expect(formatter.format(123.456)).toBe('$123.46');
  });

  it('respects custom decimal places', () => {
    const formatter = createCurrencyFormatter({ locale: 'en-US', currency: 'USD', decimals: 0 });
    expect(formatter.format(123.456)).toBe('$123');
  });

  it('works with different currencies', () => {
    const formatter = createCurrencyFormatter({ locale: 'en-GB', currency: 'GBP' });
    expect(formatter.format(100)).toBe('£100.00');
  });
});

describe('createCurrencyFormatter cache', () => {
  it('reuses formatter instances for matching options', () => {
    const first = createCurrencyFormatter({ locale: 'en-US', currency: 'USD' });
    const second = createCurrencyFormatter({ locale: 'en-US', currency: 'USD' });
    expect(second).toBe(first);
  });
});

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56, { locale: 'en-US', currency: 'USD' })).toBe('$1,234.56');
  });

  it('keeps USD as a dollar sign outside the US locale', () => {
    expect(formatCurrency(1234.56, { locale: 'en-GB', currency: 'USD' })).toBe('$1,234.56');
  });

  it('formats EUR correctly', () => {
    const result = formatCurrency(1234.56, { locale: 'de-DE', currency: 'EUR' });
    // German locale uses different separators
    expect(result).toContain('€');
    expect(result).toContain('1.234,56');
  });

  it('handles zero decimals', () => {
    expect(formatCurrency(99.99, { locale: 'en-US', currency: 'USD', decimals: 0 })).toBe('$100');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-50.25, { locale: 'en-US', currency: 'USD' })).toBe('-$50.25');
  });
});

describe('formatCurrencyParts', () => {
  it('returns parts array for custom rendering', () => {
    const parts = formatCurrencyParts(123.45, { locale: 'en-US', currency: 'USD' });
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.some(p => p.type === 'currency')).toBe(true);
    expect(parts.some(p => p.type === 'integer')).toBe(true);
    expect(parts.some(p => p.type === 'fraction')).toBe(true);
  });

  it('uses the dollar symbol for USD in non-US locales', () => {
    const currencyPart = formatCurrencyParts(123.45, { locale: 'en-GB', currency: 'USD' })
      .find((part) => part.type === 'currency');
    expect(currencyPart?.value).toBe('$');
  });

  it('uses the dollar symbol for USD when no locale is given', () => {
    const currencyPart = formatCurrencyParts(123.45, { currency: 'USD' })
      .find((part) => part.type === 'currency');
    expect(currencyPart?.value).toBe('$');
  });

  it('leaves a non-USD currency symbol untouched', () => {
    const currencyPart = formatCurrencyParts(123.45, { locale: 'en-GB', currency: 'EUR' })
      .find((part) => part.type === 'currency');
    expect(currencyPart?.value).toBe('€');
  });

  it('preserves part ordering in locales where the symbol trails the amount', () => {
    const parts = formatCurrencyParts(1234.56, { locale: 'fr-FR', currency: 'USD' });
    expect(parts.at(-1)).toMatchObject({ type: 'currency', value: '$' });
    // The leading part stays numeric, so substitution did not reorder anything.
    expect(parts[0]?.type).toBe('integer');
  });

  it('falls back to a single formatted segment when formatToParts is unavailable', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Intl.NumberFormat.prototype,
      'formatToParts',
    );
    Object.defineProperty(Intl.NumberFormat.prototype, 'formatToParts', {
      configurable: true,
      value: undefined,
    });
    try {
      const parts = formatCurrencyParts(123.45, { locale: 'en-US', currency: 'USD' });
      expect(parts).toEqual([{ type: 'literal', value: expect.any(String) }]);
      expect(formatCurrency(123.45, { locale: 'en-US', currency: 'USD' })).toBe('$123.45');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Intl.NumberFormat.prototype, 'formatToParts', originalDescriptor);
      } else {
        Reflect.deleteProperty(Intl.NumberFormat.prototype, 'formatToParts');
      }
    }
  });

});

describe('applyCurrencySymbolOverride', () => {
  it('normalises US$ and USD tokens to $ for USD', () => {
    expect(applyCurrencySymbolOverride('US$123.45', 'USD')).toBe('$123.45');
    expect(applyCurrencySymbolOverride('123,45 USD', 'USD')).toBe('123,45 $');
  });

  it('leaves non-USD currencies untouched', () => {
    expect(applyCurrencySymbolOverride('€123.45', 'EUR')).toBe('€123.45');
  });
});

describe('normalizeCurrencyCode', () => {
  it('returns USD for undefined input', () => {
    expect(normalizeCurrencyCode(undefined)).toBe('USD');
  });

  it('returns USD for empty string', () => {
    expect(normalizeCurrencyCode('')).toBe('USD');
  });

  it('maps $ to USD', () => {
    expect(normalizeCurrencyCode('$')).toBe('USD');
  });

  it('maps £ to GBP', () => {
    expect(normalizeCurrencyCode('£')).toBe('GBP');
  });

  it('maps € to EUR', () => {
    expect(normalizeCurrencyCode('€')).toBe('EUR');
  });

  it('normalizes lowercase ISO codes', () => {
    expect(normalizeCurrencyCode('usd')).toBe('USD');
    expect(normalizeCurrencyCode('gbp')).toBe('GBP');
  });

  it('passes through valid uppercase ISO codes', () => {
    expect(normalizeCurrencyCode('USD')).toBe('USD');
    expect(normalizeCurrencyCode('SGD')).toBe('SGD');
    expect(normalizeCurrencyCode('JPY')).toBe('JPY');
  });

  it('trims whitespace', () => {
    expect(normalizeCurrencyCode('  USD  ')).toBe('USD');
  });

  it('maps regional dollar variants', () => {
    expect(normalizeCurrencyCode('A$')).toBe('AUD');
    expect(normalizeCurrencyCode('C$')).toBe('CAD');
    expect(normalizeCurrencyCode('S$')).toBe('SGD');
  });

  it('falls back to USD for invalid input', () => {
    expect(normalizeCurrencyCode('invalid')).toBe('USD');
    expect(normalizeCurrencyCode('XXXX')).toBe('USD');
    expect(normalizeCurrencyCode('FOO')).toBe('USD');
  });
});
