import {
  formatCurrency,
  isSupportedCurrencyCode,
} from '@ynab-counter/app-core/utils/currency';

/** Largest miles valuation the preferences screen will save. */
export const MAX_MILES_VALUATION = 10;

/**
 * Format the "one mile is worth" preview shown beneath the miles valuation
 * field, or undefined when the entry is one the screen would refuse to save.
 *
 * The preview applies the same bounds as saving, so anything that renders a
 * sample is a value that will persist.
 */
export function formatMilesValueSample(
  currency: string,
  milesValue: string,
  locale?: string,
): string | undefined {
  // `Number.parseFloat` reads a leading number and ignores the rest, so '1abc'
  // would otherwise preview as 1. Require the whole entry to be numeric.
  const trimmedValue = milesValue.trim();
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(trimmedValue)) return undefined;

  const numeric = Number(trimmedValue);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_MILES_VALUATION) {
    return undefined;
  }

  const candidate = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(candidate)) return undefined;
  // Unknown codes must not fall back to USD here, or the preview would show a
  // dollar amount for a currency the user never chose.
  if (!isSupportedCurrencyCode(candidate)) return undefined;

  try {
    return formatCurrency(numeric * 1000, {
      locale,
      currency: candidate,
      decimals: 2,
    });
  } catch {
    return undefined;
  }
}
