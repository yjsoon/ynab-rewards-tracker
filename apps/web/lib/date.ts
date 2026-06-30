export {
  formatPeriodRange,
  clampDaysLeft,
  formatPeriodRangeParts,
} from '@ynab-counter/app-core/utils';

/**
 * Formats a Date as a UTC `YYYY-MM-DD` string.
 *
 * Note: this uses UTC (via `toISOString`), unlike `formatDateValue` in
 * `dashboard-period.ts` which formats using the local calendar date. Use this
 * helper for values compared against UTC-based data such as YNAB `since_date`
 * query params and export filenames.
 */
export function toIsoDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}
