/**
 * Options for currency formatting.
 */
export type CurrencyFormatterOptions = {
  /** BCP 47 locale string (e.g., 'en-US', 'en-GB') */
  locale?: string;
  /** ISO 4217 currency code (e.g., 'USD', 'GBP') */
  currency: string;
  /** Number of decimal places (default: 2) */
  decimals?: number;
};

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Some iOS Intl implementations ignore `currencyDisplay: 'narrowSymbol'`
 * and render USD as `US$` for non-US locales. Keep the default dollar display
 * stable across platforms while preserving the locale's number formatting.
 */
const currencySymbolOverrides: Record<string, string> = {
  USD: '$',
};

/**
 * Create an Intl.NumberFormat instance for currency formatting.
 * Requires explicit locale and currency - use platform-specific
 * resolution for defaults (navigator.language, user settings, etc.).
 */
export function createCurrencyFormatter(options: CurrencyFormatterOptions): Intl.NumberFormat {
  const { locale, currency, decimals = 2 } = options;
  const cacheKey = `${locale ?? 'default'}:${currency}:${decimals}`;
  const cached = currencyFormatters.get(cacheKey);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // Prefer narrow currency symbols (e.g., "$" for USD in many locales)
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  currencyFormatters.set(cacheKey, formatter);
  return formatter;
}

/**
 * Format a number as currency.
 * Requires explicit locale and currency options.
 */
export function formatCurrency(value: number, options: CurrencyFormatterOptions): string {
  return formatCurrencyParts(value, options).map((part) => part.value).join('');
}

/**
 * Format a number as currency parts (for custom rendering).
 * Requires explicit locale and currency options.
 */
export function formatCurrencyParts(
  value: number,
  options: CurrencyFormatterOptions,
): Intl.NumberFormatPart[] {
  const parts = createCurrencyFormatter(options).formatToParts(value);
  const replacement = currencySymbolOverrides[options.currency.toUpperCase()];

  if (!replacement) {
    return parts;
  }

  return parts.map((part) => (
    part.type === 'currency' ? { ...part, value: replacement } : part
  ));
}

/**
 * Normalize currency symbols to valid ISO 4217 codes for Intl.NumberFormat.
 * Maps common symbols ($, £, €) to ISO codes (USD, GBP, EUR).
 * Falls back to USD for invalid input.
 *
 * Note: Some symbols are ambiguous:
 * - '$' defaults to USD (also used for CAD, AUD, NZD, HKD, SGD, etc.)
 * - '¥' defaults to JPY (also used for CNY)
 * - 'kr' defaults to SEK (also used for NOK, DKK, ISK)
 *
 * For unambiguous currency selection, use 3-letter ISO codes (USD, CAD, AUD, etc.)
 */
export function normalizeCurrencyCode(input: string | undefined): string {
  if (!input || typeof input !== 'string') {
    return 'USD';
  }

  const trimmed = input.trim();

  // Map common currency symbols to ISO codes
  // Note: Some symbols are ambiguous and default to most common usage
  const symbolMap: Record<string, string> = {
    '$': 'USD',      // Default for dollar symbol (also CAD, AUD, NZD, etc.)
    '£': 'GBP',
    '€': 'EUR',
    '¥': 'JPY',      // Default for yen symbol (also CNY)
    '₹': 'INR',
    '₽': 'RUB',
    '₩': 'KRW',
    '¢': 'USD',      // Cent symbol
    'A$': 'AUD',     // Australian dollar
    'C$': 'CAD',     // Canadian dollar
    'NZ$': 'NZD',    // New Zealand dollar
    'HK$': 'HKD',    // Hong Kong dollar
    'S$': 'SGD',     // Singapore dollar
    'CHF': 'CHF',    // Swiss franc
    'kr': 'SEK',     // Default for crown symbol (also NOK, DKK, ISK)
    'zł': 'PLN',     // Polish złoty
    'R$': 'BRL',     // Brazilian real
    '元': 'CNY',     // Chinese yuan
  };

  // Check if it's a known symbol
  if (symbolMap[trimmed]) {
    return symbolMap[trimmed];
  }

  // If it's already a 3-letter ISO code, normalize to uppercase
  if (/^[a-zA-Z]{3}$/.test(trimmed)) {
    const normalized = trimmed.toUpperCase();
    if (isSupportedCurrencyCode(normalized)) {
      return normalized;
    }
  }

  // Fallback to USD for invalid input
  if (typeof console !== 'undefined' && console.warn) {
  console.warn(`Invalid currency code "${trimmed}", falling back to USD`);
  }
  return 'USD';
}

function isSupportedCurrencyCode(currency: string): boolean {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('currency').includes(currency);
  }

  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency });
    return true;
  } catch {
    return false;
  }
}
