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
    return trimmed.toUpperCase();
  }

  // Fallback to USD for invalid input
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`Invalid currency code "${trimmed}", falling back to USD`);
  }
  return 'USD';
}
