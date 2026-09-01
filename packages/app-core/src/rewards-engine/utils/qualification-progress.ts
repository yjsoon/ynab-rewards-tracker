import type { MonthlyQualificationBreakdown } from '../../storage/types';

export interface MonthlyQualificationProgress {
  metCount: number;
  failedCount: number;
  monthCount: number;
  allMet: boolean;
  /** Same-line period tally, e.g. "2 of 3 months met". */
  tally: string | null;
}

function pluralMonths(count: number): string {
  return count === 1 ? 'month' : 'months';
}

/**
 * Compact progress across a multi-month reward period. Completed months that
 * already met stay on the "this month" line as "2 of 3 months met"; a miss
 * uses the same slot as "1 of 3 months missed".
 */
export function summariseMonthlyQualificationProgress(
  months: readonly MonthlyQualificationBreakdown[],
  monthCount: number,
): MonthlyQualificationProgress {
  const metCount = months.filter((month) => month.status === 'met').length;
  const failedCount = months.filter((month) => month.status === 'failed').length;
  const totalMonths = monthCount > 0 ? monthCount : months.length;
  const allMet = totalMonths > 0 && metCount === totalMonths && failedCount === 0;

  let tally: string | null = null;
  if (failedCount > 0) {
    tally = `${failedCount} of ${totalMonths} ${pluralMonths(totalMonths)} missed`;
  } else if (metCount > 0 && !allMet) {
    tally = `${metCount} of ${totalMonths} ${pluralMonths(totalMonths)} met`;
  }

  return {
    metCount,
    failedCount,
    monthCount: totalMonths,
    allMet,
    tally,
  };
}
