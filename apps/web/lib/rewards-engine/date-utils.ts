/**
 * Date helpers tailored for YNAB's local-time date strings.
 */

/**
 * Parse a YNAB date string (YYYY-MM-DD) as a local date, preserving the user's timezone.
 */
export function parseYnabDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a local Date as a YNAB-style ISO date string (YYYY-MM-DD) without timezone conversion.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Return the last day (1-31) for the provided month of the given year.
 */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Clamp a requested billing day so it never exceeds the last day of the target month.
 */
export function getEffectiveBillingDay(year: number, month: number, requestedDay: number): number {
  const lastDay = getLastDayOfMonth(year, month);
  return Math.min(requestedDay, lastDay);
}
