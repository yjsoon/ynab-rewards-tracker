import { describe, expect, it } from 'vitest';

import type { RewardCalculation } from '@/lib/storage';

import type { CategoryCardInsight } from '../types';
import {
  STATUS_PRIORITY,
  mapLatestSubcategoryCalculations,
  resolveLatestPeriod,
  sortCategoryInsights,
} from './recommendation-helpers';

const createCalculation = (overrides: Partial<RewardCalculation>): RewardCalculation => ({
  cardId: overrides.cardId ?? 'card-1',
  ruleId: overrides.ruleId ?? 'rule-1',
  period: overrides.period ?? '2025-01',
  totalSpend: overrides.totalSpend ?? 0,
  eligibleSpend: overrides.eligibleSpend ?? 0,
  rewardEarned: overrides.rewardEarned ?? 0,
  rewardType: overrides.rewardType ?? 'cashback',
  minimumMet: overrides.minimumMet ?? false,
  maximumExceeded: overrides.maximumExceeded ?? false,
  shouldStopUsing: overrides.shouldStopUsing ?? false,
  subcategoryBreakdowns: overrides.subcategoryBreakdowns,
  rewardEarnedDollars: overrides.rewardEarnedDollars,
  minimumProgress: overrides.minimumProgress,
  maximumProgress: overrides.maximumProgress,
});

const createInsight = (overrides: Partial<CategoryCardInsight>): CategoryCardInsight => ({
  cardId: 'card-1',
  cardName: 'Card',
  cardType: 'cashback',
  rewardRate: 0,
  rewardEarnedDollars: 0,
  totalSpend: 0,
  eligibleSpend: 0,
  eligibleSpendBeforeBlocks: 0,
  hasData: true,
  minimumMet: true,
  cardMinimumMet: true,
  cardMaximumExceeded: false,
  status: 'use',
  shouldAvoid: false,
  ...overrides,
});

describe('resolveLatestPeriod', () => {
  it('identifies the most recent period', () => {
    const calculations = [
      createCalculation({ period: '2025-01' }),
      createCalculation({ period: '2025-03' }),
      createCalculation({ period: '2025-02' }),
    ];

    expect(resolveLatestPeriod(calculations)).toBe('2025-03');
  });

  it('returns undefined when no calculations provided', () => {
    expect(resolveLatestPeriod([])).toBeUndefined();
  });
});

describe('mapLatestSubcategoryCalculations', () => {
  it('captures only latest period calculations with subcategory breakdowns', () => {
    const calculations = [
      createCalculation({
        cardId: 'card-1',
        period: '2025-03',
        subcategoryBreakdowns: [{
          subcategoryId: 'sub-1',
          name: 'Dining',
          flagColor: 'blue',
          totalSpend: 100,
          eligibleSpend: 100,
          rewardEarned: 2,
          minimumSpendMet: true,
          maximumSpendExceeded: false,
        }],
      }),
      createCalculation({
        cardId: 'card-1',
        period: '2025-02',
        subcategoryBreakdowns: [{
          subcategoryId: 'sub-1',
          name: 'Dining',
          flagColor: 'blue',
          totalSpend: 90,
          eligibleSpend: 90,
          rewardEarned: 1.8,
          minimumSpendMet: true,
          maximumSpendExceeded: false,
        }],
      }),
      createCalculation({
        cardId: 'card-2',
        period: '2025-03',
        subcategoryBreakdowns: [],
      }),
      createCalculation({
        cardId: 'card-3',
        period: '2025-03',
      }),
    ];

    const { latestPeriod, byCard } = mapLatestSubcategoryCalculations(calculations);

    expect(latestPeriod).toBe('2025-03');
    expect(byCard.size).toBe(1);
    expect(byCard.get('card-1')?.period).toBe('2025-03');
  });
});

describe('sortCategoryInsights', () => {
  it('orders insights by status priority, reward rate, then reward dollars', () => {
    const insights = [
      createInsight({ cardId: 'card-1', status: 'consider', rewardRate: 0.03, rewardEarnedDollars: 10 }),
      createInsight({ cardId: 'card-2', status: 'use', rewardRate: 0.01, rewardEarnedDollars: 5 }),
      createInsight({ cardId: 'card-3', status: 'use', rewardRate: 0.02, rewardEarnedDollars: 8 }),
      createInsight({ cardId: 'card-4', status: 'avoid', rewardRate: 0.05, rewardEarnedDollars: 15 }),
      createInsight({ cardId: 'card-5', status: 'use', rewardRate: 0.02, rewardEarnedDollars: 9 }),
    ];

    const sorted = sortCategoryInsights(insights);
    const ids = sorted.map((insight) => insight.cardId);

    expect(ids).toEqual(['card-5', 'card-3', 'card-2', 'card-1', 'card-4']);
    expect(STATUS_PRIORITY[sorted[0].status]).toBeGreaterThanOrEqual(STATUS_PRIORITY[sorted[1].status]);
  });
});
