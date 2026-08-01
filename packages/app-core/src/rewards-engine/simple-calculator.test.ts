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

  it('preserves a structural below-block reason when the period minimum is unmet', () => {
    const card: CreditCard = {
      ...createMilesCardWithMinimum(100),
      earningBlockSize: 5,
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [createTransaction('small', -3_000)],
      period,
    );

    expect(calculation.transactionRewards.small).toMatchObject({
      reward: 0,
      reason: 'below_block',
      block: { size: 5, count: 0 },
    });
  });

  it('treats an unmatched flag as non-earning when no fallback tier exists', () => {
    const card = createMilesCardWithSubcategories();
    const transaction = {
      ...createTransaction('unmatched', -10_000),
      flag_color: 'orange' as const,
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [transaction],
      period,
    );

    expect(calculation.rewardEarned).toBe(0);
    expect(calculation.transactionRewards.unmatched).toMatchObject({
      reward: 0,
      rewardRate: 0,
      reason: 'zero_rate',
    });
  });

  it('does not fall back to the card rate when every enabled flag tier is inactive', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      subcategories: createMilesCardWithSubcategories().subcategories?.map((subcategory) => ({
        ...subcategory,
        active: false,
      })),
    };

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [createTransaction('inactive-tier', -10_000)],
      period,
    );

    expect(calculation.totalSpend).toBe(10);
    expect(calculation.countedSpend).toBe(0);
    expect(calculation.eligibleSpend).toBe(0);
    expect(calculation.rewardEarned).toBe(0);
    expect(calculation.subcategoryBreakdowns).toBeUndefined();
    expect(calculation.transactionRewards['inactive-tier']).toMatchObject({
      reward: 0,
      rewardDollars: 0,
      rewardRate: 0,
      reason: 'zero_rate',
    });
  });

  it('attributes a shared card cap chronologically across reward tiers', () => {
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
      { ...createTransaction('later-priority-txn', -10_000), date: '2026-02-20' },
      {
        ...createTransaction('older-lower-priority-txn', -10_000),
        date: '2026-02-05',
        flag_color: 'orange' as const,
      },
    ];

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
    );

    expect(calculation.rewardEarned).toBe(20);
    expect(calculation.transactionRewards['older-lower-priority-txn']).toMatchObject({
      reward: 20,
    });
    expect(calculation.transactionRewards['later-priority-txn']).toMatchObject({
      reward: 0,
      reason: 'cap_reached',
    });
  });

  it('attributes a same-day shared cap deterministically by transaction ID', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      maximumSpend: 10,
      subcategories: [
        {
          ...createMilesCardWithSubcategories().subcategories![0],
          id: 'higher-rate',
          rewardValue: 4,
        },
        {
          ...createMilesCardWithSubcategories().subcategories![0],
          id: 'lower-rate',
          flagColor: 'orange',
          rewardValue: 2,
        },
      ],
    };
    const lowerRateFirstByID = {
      ...createTransaction('a-lower-rate', -10_000),
      flag_color: 'orange' as const,
    };
    const higherRateSecondByID = createTransaction('z-higher-rate', -10_000);

    const forward = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [lowerRateFirstByID, higherRateSecondByID],
      period,
    );
    const shuffled = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [higherRateSecondByID, lowerRateFirstByID],
      period,
    );

    expect(shuffled.rewardEarned).toBe(forward.rewardEarned);
    expect(shuffled.transactionRewards).toEqual(forward.transactionRewards);
    expect(shuffled.subcategoryBreakdowns).toEqual(forward.subcategoryBreakdowns);
    expect(forward.rewardEarned).toBe(20);
    expect(forward.transactionRewards['a-lower-rate']).toMatchObject({ reward: 20 });
    expect(forward.transactionRewards['z-higher-rate']).toMatchObject({
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

  it('exhausts unusable card-cap headroom below one simple-rate block', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      subcategoriesEnabled: false,
      maximumSpend: 12,
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [
        createTransaction('first', -10_000),
        {
          ...createTransaction('after-unusable-headroom', -10_000),
          date: '2026-02-10',
        },
      ],
      period,
    );

    expect(calculation.countedSpend).toBe(10);
    expect(calculation.maximumSpendExceeded).toBe(true);
    expect(calculation.maximumSpendProgress).toBe(100);
    expect(calculation.transactionRewards['after-unusable-headroom']).toMatchObject({
      reward: 0,
      reason: 'cap_reached',
    });
  });

  it('exhausts unusable tier-cap headroom below one tier block', () => {
    const base = createMilesCardWithSubcategories();
    const card: CreditCard = {
      ...base,
      maximumSpend: null,
      subcategories: base.subcategories?.map((subcategory) => ({
        ...subcategory,
        maximumSpend: 12,
      })),
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [
        createTransaction('first', -10_000),
        {
          ...createTransaction('after-unusable-headroom', -10_000),
          date: '2026-02-10',
        },
      ],
      period,
    );

    expect(calculation.maximumSpendExceeded).toBe(false);
    expect(calculation.subcategoryBreakdowns?.[0]).toMatchObject({
      countedSpend: 10,
      maximumSpendExceeded: true,
    });
    expect(calculation.transactionRewards['after-unusable-headroom']).toMatchObject({
      reward: 0,
      reason: 'cap_reached',
    });
  });
});
