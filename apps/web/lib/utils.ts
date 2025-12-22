import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { storage } from '@/lib/storage'
import { normalizeCurrencyCode } from '@ynab-counter/app-core/utils/currency'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type CurrencyFormatOptions = {
  locale?: string;
  currency?: string;
  decimals?: number;
};

function resolveCurrencyFormattingOptions(options: CurrencyFormatOptions = {}) {
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

function createCurrencyFormatter(options: CurrencyFormatOptions = {}) {
  const { locale, currency } = resolveCurrencyFormattingOptions(options);
  const decimals = options.decimals ?? 2;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // Use $ instead of US$
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Convert YNAB milliunits to dollars as number
 */
export function fromMilli(amount: number): number {
  return amount / 1000;
}

/**
 * Convert YNAB milliunits to dollars, absolute value (useful for spend)
 */
export function absFromMilli(amount: number): number {
  return Math.abs(amount) / 1000;
}

/**
 * Format a dollar amount for display
 */
export function formatDollars(
  value: number,
  options: CurrencyFormatOptions = {}
): string {
  return createCurrencyFormatter(options).format(value);
}

export function formatCurrencyParts(
  value: number,
  options: CurrencyFormatOptions = {}
): Intl.NumberFormatPart[] {
  return createCurrencyFormatter(options).formatToParts(value);
}

/**
 * Format Date to YYYY-MM-DD (local date component)
 */
export function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Extracts error message from various error types
 * @param error - The error object (can be Error, string, or unknown)
 * @returns A string error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
