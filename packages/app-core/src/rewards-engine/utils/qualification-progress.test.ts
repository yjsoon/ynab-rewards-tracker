import { describe, expect, it } from 'vitest';

import { summariseMonthlyQualificationProgress } from './qualification-progress';
import type { MonthlyQualificationBreakdown } from '../../storage/types';

function month(
  start: string,
  spend: number,
  status: MonthlyQualificationBreakdown['status'],
): MonthlyQualificationBreakdown {
  return { start, end: start, spend, minimumSpend: 500, status };
}

describe('summariseMonthlyQualificationProgress', () => {
  it('tallies earlier met months beside a pending current month', () => {
    expect(summariseMonthlyQualificationProgress([
      month('2026-07-01', 551, 'met'),
      month('2026-08-01', 500, 'met'),
      month('2026-09-01', 0, 'pending'),
    ], 3)).toEqual({
      metCount: 2,
      failedCount: 0,
      monthCount: 3,
      allMet: false,
      tally: '2 of 3 months met',
    });
  });

  it('omits a tally on the first pending month', () => {
    expect(summariseMonthlyQualificationProgress([
      month('2026-07-01', 120, 'pending'),
      month('2026-08-01', 0, 'pending'),
      month('2026-09-01', 0, 'pending'),
    ], 3).tally).toBeNull();
  });

  it('does not add a tally once every month is met', () => {
    expect(summariseMonthlyQualificationProgress([
      month('2026-07-01', 500, 'met'),
      month('2026-08-01', 500, 'met'),
      month('2026-09-01', 500, 'met'),
    ], 3)).toMatchObject({
      allMet: true,
      tally: null,
    });
  });

  it('flags a missed month on the same tally slot', () => {
    expect(summariseMonthlyQualificationProgress([
      month('2026-07-01', 400, 'failed'),
      month('2026-08-01', 500, 'met'),
      month('2026-09-01', 0, 'pending'),
    ], 3).tally).toBe('1 of 3 months missed');
  });
});
