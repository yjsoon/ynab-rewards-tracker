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
  it('keeps an incomplete anchored period pending and counts all card spend toward monthly qualification', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    };
    const transactions: Transaction[] = [
      { ...createTransaction('jan-earning', -700_000), date: '2026-01-10' },
      { ...createTransaction('jan-other', -100_000), date: '2026-01-20', flag_color: 'orange' },
      { ...createTransaction('feb', -800_000), date: '2026-02-10' },
      { ...createTransaction('mar', -500_000), date: '2026-03-10' },
    ];
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, transactions, {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-03-10',
    });

    expect(calculation.qualificationStatus).toBe('pending');
    expect(calculation.monthlyQualifications).toMatchObject([
      { spend: 800, status: 'met' },
      { spend: 800, status: 'met' },
      { spend: 500, status: 'pending' },
    ]);
    expect(calculation.minimumSpendMet).toBe(false);
    expect(calculation.rewardEarned).toBe(0);
    expect(calculation.transactionRewards['jan-earning'].reason).toBe('period_incomplete');
  });

  it('qualifies an on-track period without waiting for future months', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      minimumSpend: 500,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-07-01',
        monthlyMinimumSpend: 500,
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('july', -505_000), date: '2026-07-10' },
      { ...createTransaction('august', -530_000), date: '2026-08-10' },
    ], {
      start: '2026-07-01',
      end: '2026-09-30',
      label: '2026-07-01 to 2026-09-30',
      asOf: '2026-08-20',
    });

    expect(calculation.monthlyQualifications).toMatchObject([
      { spend: 505, status: 'met' },
      { spend: 530, status: 'met' },
      { spend: 0, status: 'pending' },
    ]);
    expect(calculation.qualificationStatus).toBe('met');
    expect(calculation.minimumSpend).toBe(500);
    expect(calculation.minimumSpendMet).toBe(true);
    expect(calculation.rewardEarned).toBeGreaterThan(0);
  });

  it('fails qualification after a completed anchored month misses its minimum', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('jan', -799_000), date: '2026-01-10' },
      { ...createTransaction('feb', -800_000), date: '2026-02-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-02-15',
    });

    expect(calculation.qualificationStatus).toBe('failed');
    expect(calculation.monthlyQualifications?.[0]).toMatchObject({ spend: 799, status: 'failed' });
    expect(calculation.rewardEarned).toBe(0);
  });

  it('pools a configured subcategory cap across the full multi-month period', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 0,
      },
      subcategories: createMilesCardWithSubcategories().subcategories?.map((subcategory) => ({
        ...subcategory,
        milesBlockSize: null,
        maximumSpend: 300,
      })),
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('month-1', -10_000), date: '2026-01-10' },
      { ...createTransaction('month-2', -50_000), date: '2026-02-10' },
      { ...createTransaction('month-3', -300_000), date: '2026-03-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-03-31',
    });

    expect(calculation.qualificationStatus).toBe('not_required');
    expect(calculation.subcategoryBreakdowns?.[0]).toMatchObject({
      totalSpend: 360,
      countedSpend: 300,
      eligibleSpend: 300,
      maximumSpendExceeded: true,
    });
    expect(calculation.transactionRewards['month-3']).toMatchObject({
      reward: 960,
      rewardRate: 4,
    });
  });

  it('nets refunds against whole-card monthly qualification spend', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('purchase', -900_000), date: '2026-01-10' },
      {
        ...createTransaction('refund', 200_000),
        date: '2026-01-20',
        category_name: 'Dining Out',
      },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-02-01',
    });

    expect(calculation.monthlyQualifications?.[0]).toMatchObject({
      spend: 700,
      status: 'failed',
    });
    expect(calculation.qualificationStatus).toBe('failed');
    expect(calculation.totalSpend).toBe(900);
    expect(calculation.transactionRewards.refund).toBeUndefined();
  });

  it('excludes card payments and rebates from monthly qualification credits', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-07-01',
        monthlyMinimumSpend: 500,
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('purchases', -505_590), date: '2026-07-20' },
      {
        ...createTransaction('payment', 1_104_820),
        date: '2026-07-21',
        transfer_account_id: 'checking-account',
        payee_name: 'Transfer : Checking',
        category_name: 'Uncategorized',
      },
      {
        ...createTransaction('rebate', 30_860),
        date: '2026-07-22',
        payee_name: 'Card Rebate',
        category_name: 'Inflow: Ready to Assign',
      },
    ], {
      start: '2026-07-01',
      end: '2026-09-30',
      label: '2026-07-01 to 2026-09-30',
      asOf: '2026-08-01',
    });

    expect(calculation.monthlyQualifications?.[0]).toMatchObject({
      spend: 505.59,
      status: 'met',
    });
    expect(calculation.qualificationStatus).toBe('pending');
  });

  it('bounds reward and pooled-cap allocation at asOf', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 0,
      },
      earningBlockSize: null,
      subcategories: createMilesCardWithSubcategories().subcategories?.map((subcategory) => ({
        ...subcategory,
        milesBlockSize: null,
        maximumSpend: 100,
      })),
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('january', -60_000), date: '2026-01-10' },
      { ...createTransaction('february', -60_000), date: '2026-02-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-01-31',
    });

    expect(calculation.totalSpend).toBe(60);
    expect(calculation.subcategoryBreakdowns?.[0]).toMatchObject({
      totalSpend: 60,
      countedSpend: 60,
      eligibleSpend: 60,
    });
    expect(calculation.transactionRewards.february).toBeUndefined();
  });

  it('pools a whole-period minimum across months and stays pending after a short completed month', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 1000,
        minimumScope: 'whole_period',
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('jan', -400_000), date: '2026-01-10' },
      { ...createTransaction('feb', -200_000), date: '2026-02-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-02-15',
    });

    expect(calculation.qualificationStatus).toBe('pending');
    expect(calculation.monthlyQualifications).toMatchObject([
      { spend: 400, status: 'pending' },
      { spend: 200, status: 'pending' },
      { spend: 0, status: 'pending' },
    ]);
    expect(calculation.minimumSpendMet).toBe(false);
    expect(calculation.rewardEarned).toBe(0);
    expect(calculation.transactionRewards.jan.reason).toBe('period_incomplete');
  });

  it('unlocks rewards once the whole-period pot is reached', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 1000,
        minimumScope: 'whole_period',
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('jan', -400_000), date: '2026-01-10' },
      { ...createTransaction('feb', -600_000), date: '2026-02-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-02-15',
    });

    expect(calculation.qualificationStatus).toBe('met');
    expect(calculation.minimumSpendMet).toBe(true);
    expect(calculation.rewardEarned).toBeGreaterThan(0);
  });

  it('fails a whole-period minimum only after the window closes short', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 1000,
        minimumScope: 'whole_period',
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('jan', -400_000), date: '2026-01-10' },
      { ...createTransaction('feb', -200_000), date: '2026-02-10' },
      { ...createTransaction('mar', -100_000), date: '2026-03-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-04-01',
    });

    expect(calculation.qualificationStatus).toBe('failed');
    expect(calculation.rewardEarned).toBe(0);
  });

  it('treats a one-off window as a single pot and returns to billing after it ends', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        endDate: '2026-03-31',
        monthlyMinimumSpend: 1000,
        minimumScope: 'whole_period',
      },
    };
    const pending = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('jan', -400_000), date: '2026-01-10' },
      { ...createTransaction('feb', -200_000), date: '2026-02-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-02-15',
    });
    expect(pending.qualificationStatus).toBe('pending');
    expect(pending.rewardEarned).toBe(0);

    const closed = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('jan', -400_000), date: '2026-01-10' },
      { ...createTransaction('feb', -200_000), date: '2026-02-10' },
      { ...createTransaction('mar', -100_000), date: '2026-03-10' },
    ], {
      start: '2026-01-01',
      end: '2026-03-31',
      label: '2026-01-01 to 2026-03-31',
      asOf: '2026-04-01',
    });
    expect(closed.qualificationStatus).toBe('failed');
  });

  it('does not apply monthly qualification before the configured anchor', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-02-01',
        monthlyMinimumSpend: 800,
      },
    };
    const calculation = SimpleRewardsCalculator.calculateCardRewards(card, [
      { ...createTransaction('january', -100_000), date: '2026-01-20' },
    ], {
      start: '2026-01-10',
      end: '2026-02-09',
      label: '2026-01-10',
      asOf: '2026-01-20',
    });

    expect(calculation.qualificationStatus).toBe('not_required');
    expect(calculation.monthlyQualifications).toBeUndefined();
    expect(calculation.rewardEarned).toBeGreaterThan(0);
  });

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

  it('does not let unmatched tier spend advance the card minimum', () => {
    const card = createMilesCardWithMinimum(10);
    const matched = createTransaction('matched', -5_000);
    const unmatched = {
      ...createTransaction('unmatched', -5_000),
      flag_color: 'orange' as const,
    };

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [matched, unmatched],
      period,
    );

    expect(calculation.totalSpend).toBe(5);
    expect(calculation.minimumSpendProgress).toBe(50);
    expect(calculation.minimumSpendMet).toBe(false);
    expect(calculation.rewardEarned).toBe(0);
    expect(calculation.transactionRewards.matched).toMatchObject({
      reward: 0,
      reason: 'below_minimum',
    });
    expect(calculation.transactionRewards.unmatched).toMatchObject({
      reward: 0,
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

  it('uses the reached level rate and advances caps to the next spend target', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      type: 'cashback',
      subcategoriesEnabled: false,
      subcategories: [],
      earningRate: 6,
      earningBlockSize: null,
      minimumSpend: 800,
      maximumSpend: 325,
      spendingTiers: [{
        id: 'level-1600',
        spendThreshold: 1_600,
        earningRate: 8,
        maximumSpend: 375,
      }],
    };

    const baseLevel = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [createTransaction('base-level', -900_000)],
      period,
    );
    const higherLevel = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [createTransaction('higher-level', -1_700_000)],
      period,
    );

    expect(baseLevel).toMatchObject({
      minimumSpend: 800,
      maximumSpend: 375,
      rewardEarned: 22.5,
      activeSpendingTierId: null,
    });
    expect(baseLevel.transactionRewards['base-level']).toMatchObject({ rewardRate: 6 });
    expect(higherLevel).toMatchObject({
      minimumSpend: 1_600,
      maximumSpend: 375,
      rewardEarned: 30,
      activeSpendingTierId: 'level-1600',
    });
    expect(higherLevel.transactionRewards['higher-level']).toMatchObject({ rewardRate: 8 });
  });

  it('applies spend-tier category rates and caps while preserving categories without overrides', () => {
    const baseSubcategory = createMilesCardWithSubcategories().subcategories![0];
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      type: 'cashback',
      earningRate: 1,
      earningBlockSize: null,
      minimumSpend: 800,
      subcategories: [
        {
          ...baseSubcategory,
          rewardValue: 6,
          milesBlockSize: null,
          maximumSpend: 325,
        },
        {
          ...baseSubcategory,
          id: 'sub-2',
          name: 'Everywhere else',
          flagColor: 'orange',
          rewardValue: 1,
          milesBlockSize: null,
          maximumSpend: null,
          priority: 1,
        },
      ],
      spendingTiers: [{
        id: 'level-1600',
        spendThreshold: 1_600,
        earningRate: 1,
        maximumSpend: null,
        subcategories: [{
          subcategoryId: baseSubcategory.id,
          rewardValue: 8,
          maximumSpend: 375,
        }],
      }],
    };
    const transactions: Transaction[] = [
      createTransaction('preferred', -400_000),
      {
        ...createTransaction('other', -1_200_000),
        flag_color: 'orange',
      },
    ];

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
    );

    expect(calculation.rewardEarned).toBe(42);
    expect(calculation.subcategoryBreakdowns?.[0]).toMatchObject({
      rewardRate: 8,
      maximumSpend: 375,
      eligibleSpend: 375,
      rewardEarned: 30,
    });
    expect(calculation.subcategoryBreakdowns?.[1]).toMatchObject({
      rewardRate: 1,
      maximumSpend: null,
      eligibleSpend: 1_200,
      rewardEarned: 12,
    });
  });

  it('allows an additional spend tier below the existing base threshold', () => {
    const card: CreditCard = {
      ...createMilesCardWithSubcategories(),
      type: 'cashback',
      subcategoriesEnabled: false,
      subcategories: [],
      earningRate: 6,
      earningBlockSize: null,
      minimumSpend: 800,
      maximumSpend: 325,
      spendingTiers: [{
        id: 'level-400',
        spendThreshold: 400,
        earningRate: 4,
        maximumSpend: 200,
      }],
    };

    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      [createTransaction('lower-level', -500_000)],
      period,
    );

    expect(calculation).toMatchObject({
      minimumSpend: 400,
      maximumSpend: 325,
      rewardEarned: 13,
      activeSpendingTierId: 'level-400',
    });
  });
});
