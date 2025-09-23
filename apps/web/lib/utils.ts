import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { storage } from '@/lib/storage'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type CurrencyFormatOptions = {
  locale?: string;
  currency?: string;
};

function resolveCurrencyFormattingOptions(options: CurrencyFormatOptions = {}) {
  const locale = options.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  if (options.currency) {
    return {
      locale,
      currency: options.currency
    };
  }

  // Safe storage access for SSR compatibility
  let settingsCurrency: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      settingsCurrency = storage.getSettings().currency;
    } catch (e) {
      settingsCurrency = undefined;
    }
  }

  return {
    locale,
    currency: settingsCurrency ?? 'USD'
  };
}

function createCurrencyFormatter(options: CurrencyFormatOptions = {}) {
  const { locale, currency } = resolveCurrencyFormattingOptions(options);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // Use $ instead of US$
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
