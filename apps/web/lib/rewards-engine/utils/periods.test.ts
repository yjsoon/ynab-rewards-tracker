import { describe, expect, it } from 'vitest';

import type { CreditCard } from '@/lib/storage';

import {
  calculateCardPeriod,
  getRecentCardPeriods,
  getRewardPeriodMonths,
  periodOverlapsWindow,
  toSimplePeriod,
} from './periods';

const baseCard: CreditCard = {
  id: 'card-1',
  name: 'Test Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
};

describe('calculateCardPeriod', () => {
  it('returns calendar month bounds when no billing cycle configured', () => {
    const reference = new Date(2025, 8, 15); // September 2025
    const period = calculateCardPeriod(baseCard, reference);

    const expectedStart = new Date(2025, 8, 1);
    const expectedEnd = new Date(2025, 9, 1);
    expectedEnd.setMilliseconds(expectedEnd.getMilliseconds() - 1);

    expect(period.startDate.getTime()).toBe(expectedStart.getTime());
    expect(period.endDate.getTime()).toBe(expectedEnd.getTime());
    expect(period.label).toBe('2025-09');
  });

  it('calculates current billing cycle when reference is on or after cycle start', () => {
    const card: CreditCard = {
      ...baseCard,
      billingCycle: { type: 'billing', dayOfMonth: 20 },
    };

    const reference = new Date(2025, 8, 25); // September 25 2025
    const period = calculateCardPeriod(card, reference);

    const expectedStart = new Date(2025, 8, 20);
    const expectedEnd = new Date(2025, 9, 20);
    expectedEnd.setMilliseconds(expectedEnd.getMilliseconds() - 1);

    expect(period.startDate.getTime()).toBe(expectedStart.getTime());
    expect(period.endDate.getTime()).toBe(expectedEnd.getTime());
    expect(period.label).toBe('2025-09');
  });

  it('returns previous billing cycle when reference is before cycle start', () => {
    const card: CreditCard = {
      ...baseCard,
      billingCycle: { type: 'billing', dayOfMonth: 10 },
    };

    const reference = new Date(2025, 4, 1); // May 1 2025
    const period = calculateCardPeriod(card, reference);

    const expectedStart = new Date(2025, 3, 10);
    const expectedEnd = new Date(2025, 4, 10);
    expectedEnd.setMilliseconds(expectedEnd.getMilliseconds() - 1);

    expect(period.startDate.getTime()).toBe(expectedStart.getTime());
    expect(period.endDate.getTime()).toBe(expectedEnd.getTime());
    expect(period.label).toBe('2025-04');
  });

  it('uses repeating anchored multi-month boundaries', () => {
    const card: CreditCard = {
      ...baseCard,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-15',
        monthlyMinimumSpend: 800,
      },
    };

    const first = calculateCardPeriod(card, new Date(2026, 3, 14));
    expect(toSimplePeriod(first)).toEqual({
      start: '2026-01-15',
      end: '2026-04-14',
      label: '2026-01-15 to 2026-04-14',
    });
    const next = calculateCardPeriod(card, new Date(2026, 3, 15));
    expect(toSimplePeriod(next)).toEqual({
      start: '2026-04-15',
      end: '2026-07-14',
      label: '2026-04-15 to 2026-07-14',
    });
  });

  it('splits an anchored period into contiguous qualification months', () => {
    const card: CreditCard = {
      ...baseCard,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-31',
        monthlyMinimumSpend: 800,
      },
    };
    const period = calculateCardPeriod(card, new Date(2026, 2, 1));

    expect(getRewardPeriodMonths(card, period).map((month) => toSimplePeriod(month))).toEqual([
      { start: '2026-01-31', end: '2026-02-27', label: '2026-01-31 to 2026-02-27' },
      { start: '2026-02-28', end: '2026-03-30', label: '2026-02-28 to 2026-03-30' },
      { start: '2026-03-31', end: '2026-04-29', label: '2026-03-31 to 2026-04-29' },
    ]);
  });

  it('keeps billing or promotion boundaries before the reward-period anchor', () => {
    const card: CreditCard = {
      ...baseCard,
      billingCycle: { type: 'billing', dayOfMonth: 10 },
      promotionalPeriod: {
        startDate: '2026-01-05',
        endDate: '2026-01-31',
      },
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-02-01',
        monthlyMinimumSpend: 800,
      },
    };

    expect(toSimplePeriod(calculateCardPeriod(card, new Date(2026, 0, 20)))).toEqual({
      start: '2026-01-05',
      end: '2026-01-31',
      label: '2026-01-05 to 2026-01-31',
    });
    expect(toSimplePeriod(calculateCardPeriod(card, new Date(2026, 1, 1)))).toEqual({
      start: '2026-02-01',
      end: '2026-04-30',
      label: '2026-02-01 to 2026-04-30',
    });
  });
});

describe('toSimplePeriod', () => {
  it('converts period to string bounds and respects label preference', () => {
    const period = calculateCardPeriod(baseCard, new Date(2025, 11, 5));
    const simple = toSimplePeriod(period, true);

    expect(simple.start).toBe('2025-12-01');
    expect(simple.end).toBe('2025-12-31');
    expect(simple.label).toBe('2025-12-01');
  });
});

describe('getRecentCardPeriods', () => {
  it('returns the requested number of periods', () => {
    const periods = getRecentCardPeriods(baseCard, 4);
    expect(periods).toHaveLength(4);
    expect(periods[0].label >= periods[1].label).toBe(true);
  });

  it('returns distinct preceding multi-month periods rather than duplicate months', () => {
    const card: CreditCard = {
      ...baseCard,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2025-01-01',
        monthlyMinimumSpend: 800,
      },
    };

    const periods = getRecentCardPeriods(card, 3);
    expect(new Set(periods.map((period) => period.label)).size).toBe(3);
    expect(periods[1].endDate.getTime()).toBeLessThan(periods[0].startDate.getTime());
  });
});

describe('periodOverlapsWindow', () => {
  it('returns false when period ends before window start', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-01-31');
    expect(periodOverlapsWindow(start, end, '2025-02-01')).toBe(false);
  });

  it('returns false when period starts after window end', () => {
    const start = new Date('2025-03-01');
    const end = new Date('2025-03-31');
    expect(periodOverlapsWindow(start, end, undefined, '2025-02-28')).toBe(false);
  });

  it('returns true when period overlaps the window bounds', () => {
    const start = new Date('2025-04-01');
    const end = new Date('2025-04-30');
    expect(periodOverlapsWindow(start, end, '2025-04-15', '2025-05-15')).toBe(true);
  });
});
