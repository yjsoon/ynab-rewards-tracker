import { describe, expect, it } from 'vitest';

import type { CreditCard, RewardCalculation } from '../../storage/types';
import { selectCurrentCardCalculations } from './recommendation-helpers';

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'calendar-card',
    name: 'Calendar card',
    issuer: 'Bank',
    type: 'cashback',
    ynabAccountId: 'account-1',
    featured: true,
    earningRate: 2,
    ...overrides,
  };
}

function calculation(
  cardId: string,
  period: string,
  overrides: Partial<RewardCalculation> = {},
): RewardCalculation {
  return {
    cardId,
    ruleId: `card-${cardId}`,
    period,
    totalSpend: 100,
    eligibleSpend: 100,
    rewardEarned: 2,
    rewardType: 'cashback',
    minimumMet: true,
    maximumExceeded: false,
    shouldStopUsing: false,
    ...overrides,
  };
}

describe('selectCurrentCardCalculations', () => {
  it('drops historical calendar calculations and prefers the card-level current entry', () => {
    const selected = selectCurrentCardCalculations(
      [card()],
      [
        calculation('calendar-card', '2026-07-01 → 2026-07-31', { shouldStopUsing: true }),
        calculation('calendar-card', '2026-08-01 → 2026-08-31'),
        calculation('calendar-card', '2026-08-01 → 2026-08-31', {
          ruleId: 'legacy-rule',
          shouldStopUsing: true,
        }),
      ],
      new Date(2026, 7, 1, 12),
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      ruleId: 'card-calendar-card',
      period: '2026-08-01 → 2026-08-31',
      shouldStopUsing: false,
    });
  });

  it('matches each billing card against its own current period boundaries', () => {
    const billingCard = card({
      id: 'billing-card',
      billingCycle: { type: 'billing', dayOfMonth: 15 },
    });
    const selected = selectCurrentCardCalculations(
      [billingCard],
      [
        calculation('billing-card', '2026-06-15 → 2026-07-14'),
        calculation('billing-card', '2026-07-15 → 2026-08-14'),
      ],
      new Date(2026, 7, 1, 12),
    );

    expect(selected.map(({ period }) => period)).toEqual([
      '2026-07-15 → 2026-08-14',
    ]);
  });

  it('rejects persisted tier calculations from an older calculation policy', () => {
    const tieredCard = card({
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 5,
      }],
    });
    const staleCalculation = calculation(
      tieredCard.id,
      '2026-08-01 → 2026-08-31',
      { activeSpendingTierId: 'high-spend' },
    );
    const currentCalculation = calculation(
      tieredCard.id,
      '2026-08-01 → 2026-08-31',
      {
        activeSpendingTierId: 'high-spend',
        spendingTierCalculationVersion: 1,
      },
    );
    const referenceDate = new Date(2026, 7, 1, 12);

    expect(selectCurrentCardCalculations(
      [tieredCard],
      [staleCalculation],
      referenceDate,
    )).toEqual([]);
    expect(selectCurrentCardCalculations(
      [tieredCard],
      [currentCalculation],
      referenceDate,
    )).toEqual([currentCalculation]);
  });
});
