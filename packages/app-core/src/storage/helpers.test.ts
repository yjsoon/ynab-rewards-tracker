import { describe, expect, it } from 'vitest';

import type { RewardCalculation } from './types';
import {
  formatCalculationPeriod,
  mergeRewardCalculations,
  normalizePeriod,
} from './helpers';

function calculation(
  overrides: Partial<RewardCalculation> = {},
): RewardCalculation {
  return {
    cardId: 'card-1',
    ruleId: 'card-card-1',
    period: '2026-07-01 → 2026-07-31',
    totalSpend: 100,
    eligibleSpend: 100,
    rewardEarned: 1,
    rewardType: 'cashback',
    minimumMet: true,
    maximumExceeded: false,
    shouldStopUsing: false,
    ...overrides,
  };
}

describe('calculation period persistence', () => {
  it('round-trips exact calendar and billing-cycle boundaries', () => {
    const ranges = [
      { start: '2026-07-01', end: '2026-07-31' },
      { start: '2026-06-18', end: '2026-07-17' },
    ];

    for (const range of ranges) {
      expect(normalizePeriod(formatCalculationPeriod(range))).toEqual(range);
    }
  });
});

describe('mergeRewardCalculations', () => {
  it('replaces only the matching card, rule, and exact period', () => {
    const current = calculation({ rewardEarned: 1 });
    const historical = calculation({
      period: '2026-06-01 → 2026-06-30',
      rewardEarned: 2,
    });
    const otherRule = calculation({ ruleId: 'bonus-rule', rewardEarned: 3 });
    const replacement = calculation({ rewardEarned: 4 });

    const merged = mergeRewardCalculations(
      [current, historical, otherRule],
      [replacement],
    );

    expect(merged).toEqual([historical, otherRule, replacement]);
    expect(current.rewardEarned).toBe(1);
  });

  it('returns a new snapshot when there are no replacements', () => {
    const existing = [calculation()];
    const merged = mergeRewardCalculations(existing, []);

    expect(merged).toEqual(existing);
    expect(merged).not.toBe(existing);
  });
});
