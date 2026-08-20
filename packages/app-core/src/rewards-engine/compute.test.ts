import { describe, expect, it } from 'vitest';

import type { CreditCard, RewardRule, TransactionWithRewards } from '../storage/types';
import { RewardsCalculator } from './calculator';
import { computeCurrentPeriod, type YnabClientInterface } from './compute';
import { formatLocalDate } from './date-utils';

function createCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: overrides.id ?? 'card-1',
    name: overrides.name ?? 'Card',
    issuer: overrides.issuer ?? 'Issuer',
    type: overrides.type ?? 'cashback',
    ynabAccountId: overrides.ynabAccountId ?? 'account-1',
    featured: overrides.featured ?? true,
    earningRate: overrides.earningRate,
    subcategoriesEnabled: overrides.subcategoriesEnabled,
    ...overrides,
  };
}

function createTransaction(overrides: Partial<TransactionWithRewards> = {}): TransactionWithRewards {
  return {
    id: overrides.id ?? 'txn-1',
    date: overrides.date ?? '2026-01-01',
    amount: overrides.amount ?? -100000,
    account_id: overrides.account_id ?? 'account-1',
    ...overrides,
  };
}

function createClient(transactions: TransactionWithRewards[]): YnabClientInterface {
  return {
    async getTransactions() {
      return transactions;
    },
  };
}

describe('computeCurrentPeriod', () => {
  it('calculates plain card-level earning rates when no rules are configured', async () => {
    const card = createCard({ earningRate: 1.5 });
    const period = RewardsCalculator.calculatePeriod(card);
    const transactions = [
      createTransaction({
        date: formatLocalDate(period.startDate),
        amount: -100000,
      }),
    ];

    const [calculation] = await computeCurrentPeriod(
      createClient(transactions),
      'budget-1',
      [card],
      [],
    );

    expect(calculation).toEqual(
      expect.objectContaining({
        cardId: card.id,
        totalSpend: 100,
        eligibleSpend: 100,
        rewardEarned: 1.5,
        rewardEarnedDollars: 1.5,
      }),
    );
  });

  it('calculates a card configured only with a spend-tier earning rate', async () => {
    const card = createCard({
      earningRate: null,
      spendingTiers: [{
        id: 'spend-tier',
        spendThreshold: 100,
        earningRate: 8,
        maximumSpend: 150,
      }],
    });
    const period = RewardsCalculator.calculatePeriod(card);
    const transactions = [createTransaction({
      date: formatLocalDate(period.startDate),
      amount: -120_000,
    })];

    const [calculation] = await computeCurrentPeriod(
      createClient(transactions),
      'budget-1',
      [card],
      [],
    );

    expect(calculation).toMatchObject({
      cardId: card.id,
      totalSpend: 120,
      eligibleSpend: 120,
      rewardEarned: 9.6,
      activeSpendingTierId: 'spend-tier',
      spendingTierCalculationVersion: 1,
    });
  });

  it('uses spend tiers instead of retained legacy rules after a card is upgraded', async () => {
    const card = createCard({
      earningRate: 1,
      spendingTiers: [{
        id: 'spend-tier',
        spendThreshold: 100,
        earningRate: 5,
        maximumSpend: 150,
      }],
    });
    const period = RewardsCalculator.calculatePeriod(card);
    const rule: RewardRule = {
      id: 'legacy-rule',
      cardId: card.id,
      name: 'Legacy rewards',
      rewardType: 'cashback',
      rewardValue: 1,
      startDate: formatLocalDate(period.startDate),
      endDate: formatLocalDate(period.endDate),
      active: true,
      priority: 0,
    };

    const calculations = await computeCurrentPeriod(
      createClient([createTransaction({
        date: formatLocalDate(period.startDate),
        amount: -120_000,
      })]),
      'budget-1',
      [card],
      [rule],
    );

    expect(calculations).toHaveLength(1);
    expect(calculations[0]).toMatchObject({
      ruleId: `card-${card.id}`,
      rewardEarned: 6,
      activeSpendingTierId: 'spend-tier',
      maximumSpend: 150,
    });
  });

  it('uses the multi-month card engine instead of retained legacy rules', async () => {
    const now = new Date();
    const anchorDate = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const card = createCard({
      earningRate: 2,
      rewardPeriod: {
        monthCount: 3,
        anchorDate,
        monthlyMinimumSpend: 0,
      },
    });
    const period = RewardsCalculator.calculatePeriod(card);
    const rule: RewardRule = {
      id: 'legacy-rule',
      cardId: card.id,
      name: 'Legacy rewards',
      rewardType: 'cashback',
      rewardValue: 10,
      startDate: formatLocalDate(period.startDate),
      endDate: formatLocalDate(period.endDate),
      active: true,
      priority: 0,
    };

    const [calculation] = await computeCurrentPeriod(
      createClient([createTransaction({
        date: formatLocalDate(period.startDate),
        amount: -100_000,
      })]),
      'budget-1',
      [card],
      [rule],
    );

    expect(calculation).toMatchObject({
      ruleId: `card-${card.id}`,
      rewardEarned: 2,
      qualificationStatus: 'not_required',
    });
  });

  it('keeps retained legacy rules active before the reward-period anchor', async () => {
    const now = new Date();
    const futureAnchor = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const card = createCard({
      earningRate: 2,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: futureAnchor,
        monthlyMinimumSpend: 800,
      },
    });
    const period = RewardsCalculator.calculatePeriod(card);
    const rule: RewardRule = {
      id: 'legacy-rule',
      cardId: card.id,
      name: 'Legacy rewards',
      rewardType: 'cashback',
      rewardValue: 10,
      startDate: formatLocalDate(period.startDate),
      endDate: formatLocalDate(period.endDate),
      active: true,
      priority: 0,
    };

    const [calculation] = await computeCurrentPeriod(
      createClient([createTransaction({
        date: formatLocalDate(period.startDate),
        amount: -100_000,
      })]),
      'budget-1',
      [card],
      [rule],
    );

    expect(calculation).toMatchObject({
      ruleId: rule.id,
      rewardEarned: 10,
    });
  });

  it('clamps legacy rule calculations to the overlapping rule window', async () => {
    const card = createCard({ earningRate: undefined });
    const period = RewardsCalculator.calculatePeriod(card);
    const ruleStart = new Date(period.startDate);
    ruleStart.setDate(Math.min(ruleStart.getDate() + 14, period.endDate.getDate()));
    const ruleEnd = new Date(ruleStart);
    ruleEnd.setDate(Math.min(ruleStart.getDate() + 5, period.endDate.getDate()));

    const rule: RewardRule = {
      id: 'rule-1',
      cardId: card.id,
      name: 'Promo',
      rewardType: 'cashback',
      rewardValue: 10,
      startDate: formatLocalDate(ruleStart),
      endDate: formatLocalDate(ruleEnd),
      active: true,
      priority: 0,
    };
    const transactions = [
      createTransaction({
        id: 'before-rule',
        date: formatLocalDate(period.startDate),
        amount: -100000,
      }),
      createTransaction({
        id: 'inside-rule',
        date: formatLocalDate(ruleStart),
        amount: -50000,
      }),
    ];

    const [calculation] = await computeCurrentPeriod(
      createClient(transactions),
      'budget-1',
      [card],
      [rule],
    );

    expect(calculation.totalSpend).toBe(50);
    expect(calculation.rewardEarned).toBe(5);
  });
});
