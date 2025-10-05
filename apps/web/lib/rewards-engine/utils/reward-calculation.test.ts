import { describe, expect, it } from 'vitest';

import type { CreditCard } from '@/lib/storage';

import type { SimplifiedCalculation, SubcategoryCalculation } from '../simple-calculator';
import { createRewardCalculationFromSimple } from './reward-calculation';

const baseCard: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
};

const createSubcategory = (overrides: Partial<SubcategoryCalculation>): SubcategoryCalculation => ({
  id: overrides.id ?? 'sub-1',
  name: overrides.name ?? 'Dining',
  flagColor: overrides.flagColor ?? 'blue',
  totalSpend: overrides.totalSpend ?? 120,
  eligibleSpendBeforeBlocks: overrides.eligibleSpendBeforeBlocks ?? 120,
  eligibleSpend: overrides.eligibleSpend ?? 120,
  rewardRate: overrides.rewardRate ?? 3,
  rewardEarned: overrides.rewardEarned ?? 3.6,
  rewardEarnedDollars: overrides.rewardEarnedDollars ?? 3.6,
  minimumSpend: overrides.minimumSpend,
  minimumSpendMet: overrides.minimumSpendMet ?? true,
  maximumSpend: overrides.maximumSpend,
  maximumSpendExceeded: overrides.maximumSpendExceeded ?? false,
  blockSize: overrides.blockSize ?? null,
  blocksEarned: overrides.blocksEarned,
  active: overrides.active ?? true,
  excluded: overrides.excluded ?? false,
});

describe('createRewardCalculationFromSimple', () => {
  it('maps simplified calculation fields to reward calculation output', () => {
    const simpleCalc: SimplifiedCalculation = {
      cardId: baseCard.id,
      period: '2025-02',
      totalSpend: 500,
      eligibleSpend: 400,
      eligibleSpendBeforeBlocks: 450,
      rewardEarned: 12,
      rewardEarnedDollars: 12,
      rewardType: 'cashback',
      minimumSpend: 300,
      minimumSpendMet: true,
      minimumSpendProgress: 100,
      maximumSpend: 800,
      maximumSpendExceeded: false,
      maximumSpendProgress: 50,
      subcategoryBreakdowns: [
        createSubcategory({ id: 'sub-1', name: 'Dining', flagColor: 'blue' }),
        createSubcategory({ id: 'sub-2', name: 'Groceries', flagColor: 'green', totalSpend: 80 }),
      ],
    };

    const rewardCalc = createRewardCalculationFromSimple(baseCard, simpleCalc);

    expect(rewardCalc.cardId).toBe(baseCard.id);
    expect(rewardCalc.ruleId).toBe('card-card-1');
    expect(rewardCalc.period).toBe('2025-02');
    expect(rewardCalc.totalSpend).toBe(500);
    expect(rewardCalc.eligibleSpend).toBe(400);
    expect(rewardCalc.rewardEarned).toBe(12);
    expect(rewardCalc.rewardEarnedDollars).toBe(12);
    expect(rewardCalc.minimumProgress).toBe(100);
    expect(rewardCalc.maximumProgress).toBe(50);
    expect(rewardCalc.minimumMet).toBe(true);
    expect(rewardCalc.maximumExceeded).toBe(false);
    expect(rewardCalc.shouldStopUsing).toBe(false);
    expect(rewardCalc.subcategoryBreakdowns).toHaveLength(2);
    expect(rewardCalc.subcategoryBreakdowns?.[0]).toMatchObject({
      subcategoryId: 'sub-1',
      name: 'Dining',
      flagColor: 'blue',
      totalSpend: 120,
      eligibleSpend: 120,
      rewardEarned: 3.6,
      minimumSpendMet: true,
      maximumSpendExceeded: false,
    });
  });

  it('allows overriding the generated rule id', () => {
    const simpleCalc: SimplifiedCalculation = {
      cardId: baseCard.id,
      period: '2025-03',
      totalSpend: 100,
      eligibleSpend: 100,
      rewardEarned: 2,
      rewardEarnedDollars: 2,
      rewardType: 'cashback',
      minimumSpendMet: false,
      maximumSpendExceeded: false,
    };

    const rewardCalc = createRewardCalculationFromSimple(baseCard, simpleCalc, 'custom-rule');
    expect(rewardCalc.ruleId).toBe('custom-rule');
  });
});
