/**
 * Convert YNAB milliunits to dollars as number.
 */
export function fromMilli(amount: number): number {
  return amount / 1000;
}

/**
 * Convert YNAB milliunits to dollars, absolute value (useful for spend).
 */
export function absFromMilli(amount: number): number {
  return Math.abs(amount) / 1000;
}

/**
 * Format Date to YYYY-MM-DD using local timezone.
 * Note: Uses local date components, not UTC, to avoid off-by-one errors
 * in timezones ahead of UTC (e.g. UTC+12 at 11pm would show tomorrow in UTC).
 */
export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @deprecated Use localIsoDate instead. This uses UTC which can be off by a day.
 */
export function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Extracts error message from various error types.
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