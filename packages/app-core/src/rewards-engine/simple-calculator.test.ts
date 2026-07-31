import { describe, expect, it } from 'vitest';
import type { CreditCard, Transaction } from '../storage/types';
import { SimpleRewardsCalculator, type CalculationPeriod } from './simple-calculator';

const period: CalculationPeriod = {
  start: '2026-02-01',
  end: '2026-02-28',
  label: '2026-02',
};

function createMilesCardWithSubcategories(): CreditCard {
  return {
    id: 'card-1',
    name: 'UOB PPV 8193',
    issuer: 'UOB',
    type: 'miles',
    ynabAccountId: 'acc-1',
    featured: true,
    earningRate: 4,
    earningBlockSize: 5,
    subcategoriesEnabled: true,
    subcategories: [
      {
        id: 'sub-1',
        name: 'Contactless',
        flagColor: 'green',
        rewardValue: 4,
        milesBlockSize: 5,
        minimumSpend: null,
        maximumSpend: null,
        priority: 0,
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

function createMilesCardWithMinimum(minimumSpend: number): CreditCard {
  return {
    ...createMilesCardWithSubcategories(),
    minimumSpend,
  };
}

function createTransaction(id: string, amount: number): Transaction {
  return {
    id,
    date: '2026-02-09',
    amount,
    account_id: 'acc-1',
    flag_color: 'green',
  };
}

describe('SimpleRewardsCalculator.calculateCardRewards', () => {
  it('applies earning blocks per transaction in subcategory mode', () => {
    const card = createMilesCardWithSubcategories();
    const transactions: Transaction[] = [
      createTransaction('t1', -322640),
      createTransaction('t2', -133000),
      createTransaction('t3', -46000),
      createTransaction('t4', -40000),
    ];

    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, transactions, period);

    expect(calculation.totalSpend).toBeCloseTo(541.64, 2);
    expect(calculation.eligibleSpendBeforeBlocks).toBeCloseTo(541.64, 2);
    expect(calculation.countedSpend).toBe(535);
    expect(calculation.eligibleSpend).toBe(535);
    expect(calculation.rewardEarned).toBe(2140);

    expect(calculation.subcategoryBreakdowns).toBeDefined();
    expect(calculation.subcategoryBreakdowns?.[0]?.eligibleSpendBeforeBlocks).toBeCloseTo(541.64, 2);
    expect(calculation.subcategoryBreakdowns?.[0]?.countedSpend).toBe(535);
    expect(calculation.subcategoryBreakdowns?.[0]?.eligibleSpend).toBe(535);
    expect(calculation.subcategoryBreakdowns?.[0]?.blocksEarned).toBe(107);
  });

  it('tracks counted spend for cap/headroom even when minimum spend is not met', () => {
    const card = createMilesCardWithMinimum(600);
    const transactions: Transaction[] = [
      createTransaction('t1', -322640),
      createTransaction('t2', -133000),
      createTransaction('t3', -46000),
      createTransaction('t4', -40000),
    ];

    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, transactions, period);

    expect(calculation.totalSpend).toBeCloseTo(541.64, 2);
    expect(calculation.countedSpend).toBe(535);
    expect(calculation.eligibleSpend).toBe(0);
    expect(calculation.rewardEarned).toBe(0);
    expect(calculation.minimumSpendMet).toBe(false);
    expect(calculation.subcategoryBreakdowns?.[0]?.countedSpend).toBe(535);
    expect(calculation.subcategoryBreakdowns?.[0]?.eligibleSpend).toBe(0);
    expect(calculation.transactionRewards.t1).toMatchObject({
      reward: 0,
      rewardDollars: 0,
      reason: 'below_minimum',
    });
  });

  it('attributes capped rewards to transactions in reward-tier priority order', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      maximumSpend: 10,
      subcategories: [
        {
          ...createMilesCardWithSubcategories().subcategories![0],
          id: 'priority',
          priority: 0,
          rewardValue: 4,
        },
        {
          ...createMilesCardWithSubcategories().subcategories![0],
          id: 'later',
          flagColor: 'orange',
          priority: 1,
          rewardValue: 2,
        },
      ],
    };
    const transactions = [
      { ...createTransaction('later-txn', -10_000), flag_color: 'orange' as const },
      createTransaction('priority-txn', -10_000),
    ];

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
    );

    expect(calculation.rewardEarned).toBe(40);
    expect(calculation.transactionRewards['priority-txn']).toMatchObject({
      reward: 40,
    });
    expect(calculation.transactionRewards['later-txn']).toMatchObject({
      reward: 0,
      reason: 'cap_reached',
    });
  });

  it('consumes a period cap chronologically when transactions arrive newest-first', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      subcategoriesEnabled: false,
      maximumSpend: 10,
    };
    const transactions = [
      { ...createTransaction('newer', -10_000), date: '2026-02-20' },
      { ...createTransaction('older', -10_000), date: '2026-02-05' },
    ];

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
    );

    expect(calculation.transactionRewards.older).toMatchObject({ reward: 40 });
    expect(calculation.transactionRewards.newer).toMatchObject({
      reward: 0,
      reason: 'cap_reached',
    });
  });
});
