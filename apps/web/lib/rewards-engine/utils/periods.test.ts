import { describe, expect, it } from 'vitest';

import type { CreditCard } from '@/lib/storage';

import { calculateCardPeriod, getRecentCardPeriods, toSimplePeriod } from './periods';

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
});
