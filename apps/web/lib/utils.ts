import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { storage } from '@/lib/storage'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
  options: {
    locale?: string;
    currency?: string;
  } = {}
): string {
  const locale = options.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

  // Safe storage access for SSR compatibility
  let settingsCurrency: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      settingsCurrency = storage.getSettings().currency;
    } catch (e) {
      settingsCurrency = undefined;
    }
  }

  const currency = options.currency ?? settingsCurrency ?? 'USD';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
