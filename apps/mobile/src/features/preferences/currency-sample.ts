import {
  formatCurrency,
  normalizeCurrencyCode,
} from '@ynab-counter/app-core/utils/currency';

export function formatMilesValueSample(currency: string, milesValue: string, locale?: string) {
  const numeric = Number.parseFloat(milesValue);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;

  const candidate = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(candidate)) return undefined;

  try {
    new Intl.NumberFormat(locale, { style: 'currency', currency: candidate });
    const code = normalizeCurrencyCode(candidate);
    return formatCurrency(numeric * 1000, {
      locale,
      currency: code,
      decimals: 2,
    });
  } catch {
    return undefined;
  }
}
