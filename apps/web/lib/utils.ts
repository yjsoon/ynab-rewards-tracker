import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { storage } from '@/lib/storage'
import {
  formatCurrency,
  formatCurrencyParts as formatCurrencyPartsCore,
  normalizeCurrencyCode,
  type CurrencyFormatterOptions,
} from '@ynab-counter/app-core/utils/currency'
import { absFromMilli, fromMilli, getErrorMessage, isoDate } from '@ynab-counter/app-core/utils/general'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type CurrencyFormatOptions = {
  locale?: string;
  currency?: string;
  decimals?: number;
};

function resolveCurrencyFormattingOptions(
  options: CurrencyFormatOptions = {}
): CurrencyFormatterOptions {
  const locale = options.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  if (options.currency) {
    return {
      locale,
      currency: normalizeCurrencyCode(options.currency)
    };
  }

  // Safe storage access for SSR compatibility
  let settingsCurrency: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      settingsCurrency = storage.getSettings().currency;
    } catch (e) {
      // Storage access may fail during SSR or if localStorage is unavailable
      console.warn('Failed to access storage for currency settings:', e);
      settingsCurrency = undefined;
    }
  }

  return {
    locale,
    currency: normalizeCurrencyCode(settingsCurrency ?? '$')
  };
}

/**
 * Format a dollar amount for display
 */
export function formatDollars(
  value: number,
  options: CurrencyFormatOptions = {}
): string {
  const resolved = resolveCurrencyFormattingOptions(options);

  return formatCurrency(value, {
    ...resolved,
    decimals: options.decimals,
  });
}

export function formatCurrencyParts(
  value: number,
  options: CurrencyFormatOptions = {}
): Intl.NumberFormatPart[] {
  const resolved = resolveCurrencyFormattingOptions(options);

  return formatCurrencyPartsCore(value, {
    ...resolved,
    decimals: options.decimals,
  });
}

export { fromMilli, absFromMilli, isoDate, getErrorMessage };
