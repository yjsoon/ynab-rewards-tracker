import { describe, expect, it, vi } from 'vitest';

import type { CreditCard, RewardCalculation, Transaction } from '../storage/types';
import {
  buildRewardsDashboard,
  projectTransactions,
} from './dashboard-projection';
import { formatLocalDate } from './date-utils';
import { SimpleRewardsCalculator } from './simple-calculator';
import { REWARD_PERIOD_CALCULATION_VERSION } from './utils/reward-calculation';
import { resolveCardSpendingTier } from './utils/spending-tiers';

const referenceDate = new Date(2026, 1, 15, 12);

function createCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Daily Card',
    issuer: 'Bank',
    type: 'cashback',
    ynabAccountId: 'account-1',
    featured: true,
    earningRate: 2,
    ...overrides,
  };
}

function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    date: '2026-02-10',
    amount: -100_000,
    account_id: 'account-1',
    ...overrides,
  };
}

describe('buildRewardsDashboard', () => {
  it('projects an exact cashback period and excludes other accounts and future activity', () => {
    const card = createCard();
    const result = buildRewardsDashboard(
      [card],
      [
        createTransaction(),
        createTransaction({ id: 'other-card', account_id: 'account-2', amount: -500_000 }),
        createTransaction({ id: 'future', date: '2026-02-20', amount: -900_000 }),
        createTransaction({ id: 'incoming', amount: 25_000 }),
      ],
      {},
      referenceDate,
    );

    expect(result.asOf).toBe('2026-02-15');
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      card,
      accountId: 'account-1',
      period: {
        start: '2026-02-01',
        end: '2026-02-28',
        label: '2026-02',
      },
      calculationPeriod: {
        start: '2026-02-01',
        end: '2026-02-15',
        label: '2026-02',
      },
      reward: {
        type: 'cashback',
        amount: 2,
        dollars: 2,
      },
      spend: {
        total: 100,
        counted: 100,
        eligible: 100,
      },
      status: 'open',
      daysRemaining: 14,
      resetsOn: '2026-03-01',
    });
    expect(result.totals).toEqual({
      cardCount: 1,
      spend: 100,
      countedSpend: 100,
      eligibleSpend: 100,
      normalizedRewardDollars: 2,
      nativeRewards: {
        cashback: 2,
        miles: 0,
      },
      statusCounts: {
        unconfigured: 0,
        building: 0,
        earning: 0,
        near_cap: 0,
        capped: 0,
        open: 1,
      },
    });
  });

  it('does not use a complete persisted calculation for a historical partial view', () => {
    const card = createCard({
      minimumSpend: 500,
      maximumSpend: 1_000,
    });
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -10_000 })],
      {},
      referenceDate,
      [{
        cardId: card.id,
        ruleId: `card-${card.id}`,
        period: '2026-02-01 → 2026-02-28',
        totalSpend: 750,
        countedSpend: 750,
        eligibleSpend: 750,
        eligibleSpendBeforeBlocks: 750,
        rewardEarned: 15,
        rewardEarnedDollars: 15,
        rewardType: 'cashback',
        minimumProgress: 100,
        maximumProgress: 75,
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
      }],
    );

    expect(result.cards[0]).toMatchObject({
      spend: { total: 10, counted: 10, eligible: 0 },
      reward: { amount: 0, dollars: 0 },
      minimum: { met: false, remaining: 490, progress: 0.02 },
      maximum: { reached: false, remaining: 990, progress: 0.01 },
      status: 'building',
    });
    expect(result.totals).toMatchObject({
      spend: 10,
      countedSpend: 10,
      eligibleSpend: 0,
      normalizedRewardDollars: 0,
    });
  });

  it('uses a matching persisted calculation for the live partial view', () => {
    const now = new Date();
    const card = createCard({ minimumSpend: 500, maximumSpend: 1_000 });
    const period = SimpleRewardsCalculator.calculatePeriod(card, now);
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ date: formatLocalDate(now), amount: -10_000 })],
      {},
      now,
      [{
        cardId: card.id,
        ruleId: `card-${card.id}`,
        period: `${period.start} → ${period.end}`,
        totalSpend: 750,
        countedSpend: 750,
        eligibleSpend: 750,
        eligibleSpendBeforeBlocks: 750,
        rewardEarned: 15,
        rewardEarnedDollars: 15,
        rewardType: 'cashback',
        minimumProgress: 100,
        maximumProgress: 75,
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
      }],
    );

    expect(result.cards[0]).toMatchObject({
      spend: { total: 750, counted: 750, eligible: 750 },
      reward: { amount: 15, dollars: 15 },
      status: 'earning',
    });
  });

  it('keeps native miles while respecting an explicit zero valuation', () => {
    const milesCard = createCard({
      id: 'miles-card',
      ynabAccountId: 'miles-account',
      type: 'miles',
      earningRate: 4,
    });
    const zeroRateCard = createCard({
      id: 'zero-card',
      ynabAccountId: 'zero-account',
      earningRate: 0,
    });
    const unconfiguredCard = createCard({
      id: 'unconfigured-card',
      ynabAccountId: 'unconfigured-account',
      earningRate: undefined,
    });
    const result = buildRewardsDashboard(
      [milesCard, zeroRateCard, unconfiguredCard],
      [
        createTransaction({ account_id: 'miles-account', amount: -10_000 }),
        createTransaction({ id: 'zero-spend', account_id: 'zero-account', amount: -20_000 }),
        createTransaction({
          id: 'unconfigured-spend',
          account_id: 'unconfigured-account',
          amount: -30_000,
        }),
      ],
      { milesValuation: 0 },
      referenceDate,
    );

    expect(result.cards[0].reward).toEqual({
      type: 'miles',
      amount: 40,
      dollars: 0,
    });
    expect(result.cards[1]).toMatchObject({
      status: 'open',
      spend: { total: 20, counted: 20, eligible: 20 },
      reward: { amount: 0, dollars: 0 },
    });
    expect(result.cards[2].status).toBe('unconfigured');
    expect(result.totals.nativeRewards).toEqual({ cashback: 0, miles: 40 });
    expect(result.totals.normalizedRewardDollars).toBe(0);
    expect(result.totals.statusCounts).toMatchObject({
      open: 2,
      unconfigured: 1,
    });
  });

  it('projects card-specific reward categories with exact spend and minimum gating', () => {
    const card = createCard({
      minimumSpend: 300,
      subcategoriesEnabled: true,
      subcategories: [
        {
          id: 'fallback',
          name: 'Everything else',
          flagColor: 'unflagged',
          rewardValue: 1,
          priority: 2,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'groceries',
          name: 'Groceries bonus',
          flagColor: 'orange',
          rewardValue: 8,
          minimumSpend: 100,
          maximumSpend: 200,
          priority: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'fees',
          name: 'Fees',
          flagColor: 'red',
          rewardValue: 0,
          priority: 1,
          active: true,
          excludeFromRewards: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const originalOrder = card.subcategories?.map(({ id }) => id);
    const result = buildRewardsDashboard(
      [card],
      [
        createTransaction({
          id: 'orange-tier-not-ynab-category',
          amount: -150_000,
          category_name: 'Dining Out',
          flag_color: 'orange',
        }),
        createTransaction({ id: 'fallback', amount: -50_000, flag_color: null }),
        createTransaction({ id: 'excluded', amount: -25_000, flag_color: 'red' }),
      ],
      {},
      referenceDate,
    );
    const projection = result.cards[0];

    expect(projection.spend).toEqual({ total: 200, counted: 200, eligible: 0 });
    expect(projection.rewardCategories.map(({ id }) => id)).toEqual([
      'groceries',
      'fees',
      'fallback',
    ]);
    expect(projection.rewardCategories[0]).toMatchObject({
      name: 'Groceries bonus',
      flagColor: 'orange',
      spend: { total: 150, counted: 150, eligible: 0 },
      shareOfBreakdownSpend: 150 / 225,
      reward: { type: 'cashback', amount: 0, dollars: 0 },
      rate: 8,
      minimum: { target: 100, remaining: 0, progress: 1, met: true },
      maximum: { target: 200, remaining: 50, progress: 0.75, reached: false },
      excluded: false,
      blockedByCardMinimum: true,
    });
    expect(projection.rewardCategories[1]).toMatchObject({
      name: 'Fees',
      spend: { total: 25, counted: 0, eligible: 0 },
      shareOfBreakdownSpend: 25 / 225,
      excluded: true,
      blockedByCardMinimum: false,
    });
    expect(projection.rewardCategories[2]).toMatchObject({
      name: 'Everything else',
      spend: { total: 50, counted: 50, eligible: 0 },
      shareOfBreakdownSpend: 50 / 225,
      blockedByCardMinimum: true,
    });
    expect(card.subcategories?.map(({ id }) => id)).toEqual(originalOrder);
  });

  it('projects an active spend-tier category rate and an intentionally removed cap', () => {
    const category = {
      id: 'groceries',
      name: 'Groceries',
      flagColor: 'orange' as const,
      rewardValue: 6,
      maximumSpend: 50,
      priority: 0,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const card = createCard({
      earningRate: 1,
      minimumSpend: 50,
      subcategoriesEnabled: true,
      subcategories: [category],
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 1,
        maximumSpend: null,
        subcategories: [{
          subcategoryId: category.id,
          rewardValue: 8,
          maximumSpend: null,
        }],
      }],
    });

    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -120_000, flag_color: 'orange' })],
      {},
      referenceDate,
    );

    expect(result.cards[0]).toMatchObject({
      reward: { amount: 9.6, dollars: 9.6 },
      maximum: { target: null, reached: false },
      status: 'earning',
    });
    expect(result.cards[0].rewardCategories[0]).toMatchObject({
      rate: 8,
      reward: { amount: 9.6, dollars: 9.6 },
      maximum: { target: null, reached: false },
    });
  });

  it('advances category caps at each threshold while retaining the reached level rate', () => {
    const timestamp = '2026-01-01T00:00:00.000Z';
    const card = createCard({
      earningRate: 8,
      minimumSpend: 1_600,
      subcategoriesEnabled: true,
      subcategories: [{
        id: 'groceries',
        name: 'Groceries',
        flagColor: 'orange',
        rewardValue: 8,
        maximumSpend: 375,
        priority: 0,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      spendingTiers: [{
        id: 'level-800',
        spendThreshold: 800,
        earningRate: 6,
        subcategories: [{
          subcategoryId: 'groceries',
          rewardValue: 6,
          maximumSpend: 333,
        }],
      }],
    });

    const beforeFirstThreshold = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -500_000, flag_color: 'orange' })],
      {},
      referenceDate,
    ).cards[0];
    const atFirstThreshold = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -800_000, flag_color: 'orange' })],
      {},
      referenceDate,
    ).cards[0];
    const betweenThresholds = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -900_000, flag_color: 'orange' })],
      {},
      referenceDate,
    ).cards[0];
    const aboveHighestThreshold = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -1_610_000, flag_color: 'orange' })],
      {},
      referenceDate,
    ).cards[0];

    const beforeResolution = resolveCardSpendingTier(card, beforeFirstThreshold.spend.total);
    expect(beforeResolution.activeLevel).toBeNull();
    expect(beforeResolution.nextLevel).toMatchObject({
      id: 'level-800',
      spendThreshold: 800,
    });
    expect(beforeResolution.nextLevel!.spendThreshold - beforeFirstThreshold.spend.total).toBe(300);
    expect(beforeFirstThreshold).toMatchObject({
      minimum: { target: 800, met: false },
      reward: { amount: 0 },
    });
    expect(beforeFirstThreshold.rewardCategories[0]).toMatchObject({
      rate: 6,
      maximum: { target: 333 },
    });

    expect(atFirstThreshold.calculation.activeSpendingTierId).toBe('level-800');
    expect(atFirstThreshold).toMatchObject({
      minimum: { target: 800, met: true },
      reward: { amount: 22.5 },
    });
    expect(atFirstThreshold.rewardCategories[0]).toMatchObject({
      rate: 6,
      maximum: { target: 375 },
    });

    const betweenResolution = resolveCardSpendingTier(card, betweenThresholds.spend.total);
    expect(betweenResolution.activeLevel).toMatchObject({ id: 'level-800' });
    expect(betweenResolution.nextLevel).toMatchObject({
      id: null,
      isBase: true,
      spendThreshold: 1_600,
    });
    expect(betweenResolution.nextLevel!.spendThreshold - betweenThresholds.spend.total).toBe(700);
    expect(betweenThresholds.rewardCategories[0]).toMatchObject({
      rate: 6,
      maximum: { target: 375 },
    });

    const highestResolution = resolveCardSpendingTier(card, aboveHighestThreshold.spend.total);
    expect(highestResolution.activeLevel).toMatchObject({
      id: null,
      isBase: true,
      spendThreshold: 1_600,
    });
    expect(highestResolution.nextLevel).toBeNull();
    expect(aboveHighestThreshold).toMatchObject({
      minimum: { target: 1_600, met: true },
      reward: { amount: 30 },
    });
    expect(aboveHighestThreshold.rewardCategories[0]).toMatchObject({
      rate: 8,
      maximum: { target: 375 },
    });
  });

  it('ignores persisted tier calculations from the previous cap policy', () => {
    const timestamp = '2026-01-01T00:00:00.000Z';
    const card = createCard({
      earningRate: 8,
      minimumSpend: 1_600,
      subcategoriesEnabled: true,
      subcategories: [{
        id: 'groceries',
        name: 'Groceries',
        flagColor: 'orange',
        rewardValue: 8,
        maximumSpend: 375,
        priority: 0,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      spendingTiers: [{
        id: 'level-800',
        spendThreshold: 800,
        earningRate: 6,
        subcategories: [{
          subcategoryId: 'groceries',
          rewardValue: 6,
          maximumSpend: 333,
        }],
      }],
    });

    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -900_000, flag_color: 'orange' })],
      {},
      referenceDate,
      [{
        cardId: card.id,
        ruleId: `card-${card.id}`,
        period: '2026-02-01 → 2026-02-28',
        totalSpend: 900,
        countedSpend: 333,
        eligibleSpend: 333,
        rewardEarned: 19.98,
        rewardType: 'cashback',
        minimumSpend: 800,
        activeSpendingTierId: 'level-800',
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
        subcategoryBreakdowns: [{
          subcategoryId: 'groceries',
          name: 'Groceries',
          flagColor: 'orange',
          totalSpend: 900,
          countedSpend: 333,
          eligibleSpend: 333,
          rewardEarned: 19.98,
          rewardRate: 6,
          minimumSpendMet: true,
          maximumSpend: 333,
          maximumSpendExceeded: true,
        }],
      }],
    ).cards[0];

    expect(result).toMatchObject({
      spend: { total: 900, counted: 375, eligible: 375 },
      reward: { amount: 22.5, dollars: 22.5 },
      calculation: { activeSpendingTierId: 'level-800' },
    });
    expect(result.rewardCategories[0]).toMatchObject({
      rate: 6,
      maximum: { target: 375 },
    });
  });

  it('does not read minimum status from a rejected persisted tier calculation', () => {
    const card = createCard({
      earningRate: 8,
      minimumSpend: 1_600,
      spendingTiers: [{
        id: 'level-800',
        spendThreshold: 800,
        earningRate: 6,
      }],
    });

    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -400_000 })],
      {},
      referenceDate,
      [{
        cardId: card.id,
        ruleId: `card-${card.id}`,
        period: '2026-02-01 → 2026-02-28',
        totalSpend: 900,
        eligibleSpend: 900,
        rewardEarned: 54,
        rewardType: 'cashback',
        minimumSpend: 800,
        activeSpendingTierId: 'level-800',
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
      }],
    ).cards[0];

    expect(result).toMatchObject({
      spend: { total: 400, eligible: 0 },
      minimum: { target: 800, remaining: 400, met: false },
      status: 'building',
    });
  });

  it('uses the next target cap while a higher spend level can still be unlocked', () => {
    const card = createCard({
      minimumSpend: 50,
      maximumSpend: 20,
      spendingTiers: [{
        id: 'higher-level',
        spendThreshold: 100,
        earningRate: 3,
        maximumSpend: 30,
      }],
    });

    const betweenLevels = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -80_000 })],
      {},
      referenceDate,
    );
    const highestLevel = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -120_000 })],
      {},
      referenceDate,
    );

    expect(betweenLevels.cards[0]).toMatchObject({
      spend: { total: 80, eligible: 30 },
      maximum: { target: 30, reached: true },
      status: 'earning',
    });
    expect(highestLevel.cards[0]).toMatchObject({
      spend: { total: 120, eligible: 30 },
      maximum: { target: 30, reached: true },
      status: 'capped',
    });
  });

  it('does not mix a pre-tier persisted reward with fresh spend-tier metadata', () => {
    const card = createCard({
      earningRate: 1,
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 5,
        maximumSpend: 150,
      }],
    });
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -120_000 })],
      {},
      referenceDate,
      [{
        cardId: card.id,
        ruleId: `card-${card.id}`,
        period: '2026-02-01 → 2026-02-28',
        totalSpend: 120,
        eligibleSpend: 120,
        rewardEarned: 1.2,
        rewardEarnedDollars: 1.2,
        rewardType: 'cashback',
        minimumMet: true,
        maximumExceeded: false,
        shouldStopUsing: false,
      }],
    );

    expect(result.cards[0]).toMatchObject({
      reward: { amount: 6, dollars: 6 },
      calculation: { activeSpendingTierId: 'high-spend' },
      maximum: { target: 150 },
    });
  });

  it('inherits card block size for category cap progress while retaining native miles at zero value', () => {
    const card = createCard({
      type: 'miles',
      earningBlockSize: 5,
      subcategoriesEnabled: true,
      subcategories: [
        {
          id: 'travel',
          name: 'Travel',
          flagColor: 'yellow',
          rewardValue: 4,
          maximumSpend: 20,
          priority: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const result = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'large', amount: -12_000, flag_color: 'yellow' }),
        createTransaction({ id: 'small', amount: -4_000, flag_color: 'yellow' }),
      ],
      { milesValuation: 0 },
      referenceDate,
    );

    expect(result.cards[0].rewardCategories[0]).toMatchObject({
      spend: { total: 16, counted: 10, eligible: 10 },
      reward: { type: 'miles', amount: 40, dollars: 0 },
      maximum: { target: 20, remaining: 10, progress: 0.5, reached: false },
      blockInfo: {
        size: 5,
        eligibleSpendBeforeBlocks: 16,
        eligibleSpendAfterBlocks: 10,
        uncountedEligibleSpend: 6,
        blocksEarned: 2,
      },
    });
  });

  it('surfaces a card-wide cap on a tier whose own cap has headroom', () => {
    const card = createCard({
      maximumSpend: 50,
      subcategoriesEnabled: true,
      subcategories: [{
        id: 'bonus',
        name: 'Bonus',
        flagColor: 'orange',
        rewardValue: 5,
        maximumSpend: 100,
        priority: 0,
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    });
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -50_000, flag_color: 'orange' })],
      {},
      referenceDate,
    );

    expect(result.cards[0].rewardCategories[0].maximum).toMatchObject({
      target: 100,
      remaining: 0,
      progress: 1,
      reached: true,
    });
  });

  it('ignores preserved miles-only tier blocks after a card changes to cashback', () => {
    const card = createCard({
      type: 'cashback',
      subcategoriesEnabled: true,
      subcategories: [{
        id: 'bonus',
        name: 'Bonus',
        flagColor: 'orange',
        rewardValue: 5,
        milesBlockSize: 5,
        priority: 0,
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    });
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ amount: -12_000, flag_color: 'orange' })],
      {},
      referenceDate,
    );

    expect(result.cards[0]).toMatchObject({
      spend: { total: 12, counted: 12, eligible: 12 },
      blockInfo: null,
    });
    expect(result.cards[0].reward.amount).toBeCloseTo(0.6);
    expect(result.cards[0].reward.dollars).toBeCloseTo(0.6);
    expect(result.cards[0].rewardCategories[0].blockInfo).toBeNull();
  });

  it('keeps block-counted category cap headroom available for a later full block', () => {
    const card = createCard({
      type: 'miles',
      earningBlockSize: 5,
      subcategoriesEnabled: true,
      subcategories: [
        {
          id: 'travel',
          name: 'Travel',
          flagColor: 'yellow',
          rewardValue: 4,
          maximumSpend: 20,
          priority: 0,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const firstResult = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'twelve', amount: -12_000, flag_color: 'yellow' }),
        createTransaction({ id: 'eight', amount: -8_000, flag_color: 'yellow' }),
      ],
      { milesValuation: 0.01 },
      referenceDate,
    );
    const cappedResult = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'twelve', amount: -12_000, flag_color: 'yellow' }),
        createTransaction({ id: 'eight', amount: -8_000, flag_color: 'yellow' }),
        createTransaction({ id: 'five', amount: -5_000, flag_color: 'yellow' }),
      ],
      { milesValuation: 0.01 },
      referenceDate,
    );

    expect(firstResult.cards[0].rewardCategories[0]).toMatchObject({
      spend: { total: 20, counted: 15, eligible: 15 },
      reward: { amount: 60, dollars: 0.6 },
      maximum: { target: 20, remaining: 5, progress: 0.75, reached: false },
    });
    expect(cappedResult.cards[0].rewardCategories[0]).toMatchObject({
      spend: { total: 25, counted: 20, eligible: 20 },
      reward: { amount: 80, dollars: 0.8 },
      maximum: { target: 20, remaining: 0, progress: 1, reached: true },
    });
  });

  it('does not invent reward categories for a simple-rate card', () => {
    const result = buildRewardsDashboard(
      [createCard()],
      [createTransaction()],
      {},
      referenceDate,
    );

    expect(result.cards[0].rewardCategories).toEqual([]);
  });

  it('preserves block-rounded spend and exposes structured block progress', () => {
    const card = createCard({
      type: 'miles',
      earningRate: 4,
      earningBlockSize: 5,
    });
    const result = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'large', amount: -12_500 }),
        createTransaction({ id: 'below-one-block', amount: -4_000 }),
      ],
      { milesValuation: 0.01 },
      referenceDate,
    );
    const projected = result.cards[0];

    expect(projected.spend).toEqual({
      total: 16.5,
      counted: 10,
      eligible: 10,
    });
    expect(projected.reward).toEqual({
      type: 'miles',
      amount: 40,
      dollars: 0.4,
    });
    expect(projected.blockInfo).toEqual({
      sizes: [5],
      eligibleSpendBeforeBlocks: 16.5,
      eligibleSpendAfterBlocks: 10,
      uncountedEligibleSpend: 6.5,
      blocksEarned: 2,
    });
    expect(projected.progress.maximumProgressSpend).toBe(10);
  });

  it('keeps simple-rate block cap headroom available for a later full block', () => {
    const card = createCard({
      type: 'miles',
      earningRate: 4,
      earningBlockSize: 5,
      maximumSpend: 20,
    });
    const firstResult = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'twelve', amount: -12_000 }),
        createTransaction({ id: 'eight', amount: -8_000 }),
      ],
      { milesValuation: 0.01 },
      referenceDate,
    );
    const cappedResult = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'twelve', amount: -12_000 }),
        createTransaction({ id: 'eight', amount: -8_000 }),
        createTransaction({ id: 'five', amount: -5_000 }),
      ],
      { milesValuation: 0.01 },
      referenceDate,
    );

    expect(firstResult.cards[0]).toMatchObject({
      spend: { total: 20, counted: 15, eligible: 15 },
      reward: { amount: 60, dollars: 0.6 },
      maximum: { target: 20, remaining: 5, progress: 0.75, reached: false },
    });
    expect(cappedResult.cards[0]).toMatchObject({
      spend: { total: 25, counted: 20, eligible: 20 },
      reward: { amount: 80, dollars: 0.8 },
      maximum: { target: 20, remaining: 0, progress: 1, reached: true },
      status: 'capped',
    });
  });

  it('marks sub-block card-cap headroom as exhausted', () => {
    const card = createCard({
      type: 'miles',
      earningRate: 4,
      earningBlockSize: 5,
      maximumSpend: 12,
    });
    const result = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'first', amount: -10_000 }),
        createTransaction({ id: 'after-unusable-headroom', amount: -10_000 }),
      ],
      { milesValuation: 0.01 },
      referenceDate,
    );

    expect(result.cards[0]).toMatchObject({
      spend: { counted: 10, eligible: 10 },
      maximum: { target: 12, remaining: 0, progress: 1, reached: true },
      status: 'capped',
    });
  });

  it('distinguishes building, earning, near-cap, and capped threshold states', () => {
    const cards = [
      createCard({
        id: 'building',
        ynabAccountId: 'building-account',
        minimumSpend: 100,
      }),
      createCard({
        id: 'earning',
        ynabAccountId: 'earning-account',
        minimumSpend: 100,
        maximumSpend: 200,
      }),
      createCard({
        id: 'near',
        ynabAccountId: 'near-account',
        maximumSpend: 100,
      }),
      createCard({
        id: 'capped',
        ynabAccountId: 'capped-account',
        maximumSpend: 100,
      }),
      createCard({
        id: 'exact-cap',
        ynabAccountId: 'exact-cap-account',
        maximumSpend: 100,
      }),
    ];
    const result = buildRewardsDashboard(
      cards,
      [
        createTransaction({ account_id: 'building-account', amount: -60_000 }),
        createTransaction({ id: 'earning-spend', account_id: 'earning-account', amount: -120_000 }),
        createTransaction({ id: 'near-spend', account_id: 'near-account', amount: -80_000 }),
        createTransaction({ id: 'capped-spend', account_id: 'capped-account', amount: -120_000 }),
        createTransaction({ id: 'exact-spend', account_id: 'exact-cap-account', amount: -100_000 }),
      ],
      {},
      referenceDate,
    );
    const [building, earning, near, capped, exactCap] = result.cards;

    expect(building).toMatchObject({
      status: 'building',
      minimum: { target: 100, remaining: 40, progress: 0.6, met: false },
      reward: { amount: 0, dollars: 0 },
    });
    expect(earning).toMatchObject({
      status: 'earning',
      minimum: { target: 100, remaining: 0, progress: 1, met: true },
      maximum: { target: 200, remaining: 80, over: 0, progress: 0.6, reached: false },
    });
    expect(near).toMatchObject({
      status: 'near_cap',
      maximum: { target: 100, remaining: 20, over: 0, progress: 0.8, reached: false },
    });
    expect(capped).toMatchObject({
      status: 'capped',
      maximum: { target: 100, remaining: 0, over: 20, progress: 1, reached: true },
    });
    expect(exactCap).toMatchObject({
      status: 'capped',
      maximum: { target: 100, remaining: 0, over: 0, progress: 1, reached: true },
    });
    expect(result.totals.statusCounts).toEqual({
      unconfigured: 0,
      building: 1,
      earning: 1,
      near_cap: 1,
      capped: 2,
      open: 0,
    });
  });

  it('uses a custom billing cycle for reset date and days remaining', () => {
    const card = createCard({
      billingCycle: { type: 'billing', dayOfMonth: 10 },
    });
    const result = buildRewardsDashboard(
      [card],
      [],
      {},
      new Date(2026, 1, 5),
    );

    expect(result.cards[0]).toMatchObject({
      period: {
        start: '2026-01-10',
        end: '2026-02-09',
        label: '2026-01-10',
      },
      calculationPeriod: {
        start: '2026-01-10',
        end: '2026-02-05',
      },
      resetsOn: '2026-02-10',
      daysRemaining: 5,
    });
  });

  it('projects the active monthly minimum and does not classify failed qualification as open', () => {
    const card = createCard({
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    });
    const result = buildRewardsDashboard(
      [card],
      [
        createTransaction({ id: 'jan', date: '2026-01-10', amount: -799_000 }),
        createTransaction({ id: 'feb', date: '2026-02-10', amount: -500_000 }),
      ],
      {},
      referenceDate,
    );

    expect(result.cards[0]).toMatchObject({
      status: 'building',
      minimum: { target: 800, remaining: 300, progress: 0.625, met: false },
      progress: { minimumProgressSpend: 500 },
      calculation: { qualificationStatus: 'failed' },
      reward: { amount: 0, dollars: 0 },
    });
  });

  it('does not overlay a full-period persisted result onto a historical partial view', () => {
    const card = createCard({
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    });
    const persisted: RewardCalculation = {
      cardId: card.id,
      ruleId: `card-${card.id}`,
      period: '2026-01-01 → 2026-03-31',
      totalSpend: 2_400,
      countedSpend: 2_400,
      eligibleSpend: 2_400,
      rewardEarned: 48,
      rewardEarnedDollars: 48,
      rewardType: 'cashback',
      monthlyMinimumSpend: 800,
      qualificationStatus: 'met',
      monthlyQualifications: [],
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
    };
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ date: '2026-01-10', amount: -500_000 })],
      {},
      new Date(2026, 0, 15, 12),
      [persisted],
    );

    expect(result.cards[0].spend.total).toBe(500);
    expect(result.cards[0].reward.amount).toBe(0);
    expect(result.cards[0].calculation.qualificationStatus).toBe('pending');
  });

  it('ignores legacy persisted reward-period calculations without qualification metadata', () => {
    const card = createCard({
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    });
    const legacy: RewardCalculation = {
      cardId: card.id,
      ruleId: `card-${card.id}`,
      period: '2026-01-01 → 2026-03-31',
      totalSpend: 99_999,
      eligibleSpend: 99_999,
      rewardEarned: 1_999.98,
      rewardType: 'cashback',
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
    };
    const transactions = ['01', '02', '03'].map((month) => createTransaction({
      id: month,
      date: `2026-${month}-10`,
      amount: -800_000,
    }));
    const result = buildRewardsDashboard(
      [card],
      transactions,
      {},
      new Date(2026, 2, 31, 12),
      [legacy],
    );

    expect(result.cards[0].spend.total).toBe(2_400);
    expect(result.cards[0].reward.amount).toBe(48);
    expect(result.cards[0].calculation.qualificationStatus).toBe('met');
  });

  it('recomputes persisted pending rewards created before future months became non-blocking', () => {
    const card = createCard({
      minimumSpend: 500,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 500,
      },
    });
    const stale: RewardCalculation = {
      cardId: card.id,
      ruleId: `card-${card.id}`,
      period: '2026-01-01 → 2026-03-31',
      totalSpend: 500,
      countedSpend: 500,
      eligibleSpend: 0,
      rewardEarned: 0,
      rewardType: 'cashback',
      minimumSpend: 500,
      monthlyMinimumSpend: 500,
      qualificationStatus: 'pending',
      monthlyQualifications: [
        { start: '2026-01-01', end: '2026-01-31', spend: 500, minimumSpend: 500, status: 'met' },
        { start: '2026-02-01', end: '2026-02-28', spend: 0, minimumSpend: 500, status: 'pending' },
        { start: '2026-03-01', end: '2026-03-31', spend: 0, minimumSpend: 500, status: 'pending' },
      ],
      minimumMet: false,
      maximumExceeded: false,
      shouldStopUsing: false,
    };
    const result = buildRewardsDashboard(
      [card],
      [createTransaction({ date: '2026-01-10', amount: -500_000 })],
      {},
      new Date(2026, 0, 20, 12),
      [stale],
    );

    expect(result.cards[0].calculation).toMatchObject({
      qualificationStatus: 'met',
      minimumSpend: 500,
      minimumSpendMet: true,
      rewardEarned: 10,
    });
  });

  it('re-derives persisted qualification when an anchored month rolls over', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 1, 12));
    try {
      const card = createCard({
        rewardPeriod: {
          monthCount: 3,
          anchorDate: '2026-01-01',
          monthlyMinimumSpend: 800,
        },
      });
      const persisted: RewardCalculation = {
        cardId: card.id,
        ruleId: `card-${card.id}`,
        period: '2026-01-01 → 2026-03-31',
        totalSpend: 700,
        countedSpend: 700,
        eligibleSpend: 0,
        rewardEarned: 0,
        rewardType: 'cashback',
        monthlyMinimumSpend: 800,
        qualificationStatus: 'pending',
        monthlyQualifications: [
          { start: '2026-01-01', end: '2026-01-31', spend: 700, minimumSpend: 800, status: 'pending' },
          { start: '2026-02-01', end: '2026-02-28', spend: 0, minimumSpend: 800, status: 'pending' },
          { start: '2026-03-01', end: '2026-03-31', spend: 0, minimumSpend: 800, status: 'pending' },
        ],
        rewardPeriodCalculationVersion: REWARD_PERIOD_CALCULATION_VERSION,
        minimumMet: false,
        maximumExceeded: false,
        shouldStopUsing: false,
      };
      const result = buildRewardsDashboard(
        [card],
        [createTransaction({ date: '2026-01-10', amount: -700_000 })],
        {},
        new Date(2026, 1, 1, 12),
        [persisted],
      );

      expect(result.cards[0].calculation.qualificationStatus).toBe('failed');
      expect(result.cards[0].calculation.monthlyQualifications?.[0].status).toBe('failed');
      expect(result.cards[0].status).toBe('building');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('projectTransactions', () => {
  it('maps cards and accounts and calculates raw and normalized block rewards', () => {
    const card = createCard({
      type: 'miles',
      earningRate: 4,
      earningBlockSize: 5,
    });
    const [projection] = projectTransactions(
      [createTransaction({ amount: -12_500 })],
      [card],
      { milesValuation: 0.02 },
      new Map([['account-1', 'YNAB Visa']]),
    );

    expect(projection).toMatchObject({
      account: { id: 'account-1', name: 'YNAB Visa' },
      card,
      amount: 12.5,
      status: 'earning',
      noRewardReason: null,
      reward: {
        type: 'miles',
        rate: 4,
        amount: 40,
        dollars: 0.8,
      },
      blockInfo: {
        size: 5,
        count: 2,
        eligibleAmount: 10,
        remainder: 2.5,
      },
    });
  });

  it('provides incoming, no-card, zero-rate, and below-block states', () => {
    const regularCard = createCard();
    const zeroRateCard = createCard({
      id: 'zero-rate',
      ynabAccountId: 'zero-account',
      earningRate: 0,
    });
    const blockCard = createCard({
      id: 'block-card',
      ynabAccountId: 'block-account',
      type: 'miles',
      earningRate: 4,
      earningBlockSize: 5,
    });
    const projections = projectTransactions(
      [
        createTransaction({ id: 'incoming', amount: 100_000 }),
        createTransaction({ id: 'untracked', account_id: 'untracked-account' }),
        createTransaction({ id: 'zero', account_id: 'zero-account' }),
        createTransaction({ id: 'small', account_id: 'block-account', amount: -3_000 }),
      ],
      [regularCard, zeroRateCard, blockCard],
      {},
      {
        'untracked-account': 'Everyday Account',
      },
    );

    expect(projections[0]).toMatchObject({
      status: 'incoming',
      card: regularCard,
      reward: { rate: 0, amount: 0, dollars: 0 },
    });
    expect(projections[1]).toMatchObject({
      status: 'no_card',
      account: { id: 'untracked-account', name: 'Everyday Account' },
      card: null,
      noRewardReason: null,
    });
    expect(projections[2]).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'zero_rate',
      reward: { rate: 0, amount: 0, dollars: 0 },
    });
    expect(projections[3]).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'below_block',
      reward: { rate: 4, amount: 0, dollars: 0 },
      blockInfo: {
        size: 5,
        count: 0,
        eligibleAmount: 0,
        remainder: 3,
      },
    });
  });

  it('marks excluded subcategories as no reward without leaking display copy', () => {
    const card = createCard({
      subcategoriesEnabled: true,
      subcategories: [
        {
          id: 'excluded',
          name: 'Excluded',
          flagColor: 'red',
          rewardValue: 5,
          priority: 0,
          active: true,
          excludeFromRewards: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const [projection] = projectTransactions(
      [createTransaction({ flag_color: 'red' })],
      [card],
    );

    expect(projection).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'excluded',
      reward: { rate: 0, amount: 0, dollars: 0 },
      blockInfo: null,
    });
  });

  it('uses period minimum and cap allocations for transaction reward status', () => {
    const belowMinimum = createCard({
      id: 'minimum-card',
      ynabAccountId: 'minimum-account',
      minimumSpend: 100,
    });
    const capped = createCard({
      id: 'capped-card',
      ynabAccountId: 'capped-account',
      maximumSpend: 50,
    });
    const projections = projectTransactions(
      [
        createTransaction({
          id: 'below-minimum',
          account_id: 'minimum-account',
          amount: -10_000,
        }),
        createTransaction({
          id: 'within-cap',
          account_id: 'capped-account',
          date: '2026-02-09',
          amount: -50_000,
        }),
        createTransaction({
          id: 'after-cap',
          account_id: 'capped-account',
          amount: -25_000,
        }),
      ],
      [belowMinimum, capped],
    );

    expect(projections[0]).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'below_minimum',
      reward: { amount: 0, dollars: 0 },
    });
    expect(projections[1]).toMatchObject({
      status: 'earning',
      reward: { amount: 1, dollars: 1 },
    });
    expect(projections[2]).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'cap_reached',
      reward: { amount: 0, dollars: 0 },
    });
  });

  it('does not infer threshold outcomes from an incomplete transaction period', () => {
    const card = createCard({ minimumSpend: 100 });
    const [projection] = projectTransactions(
      [createTransaction({ amount: -10_000 })],
      [card],
      {},
      undefined,
      { periodDataComplete: false },
    );

    expect(projection).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'period_incomplete',
      reward: {
        rate: 2,
        amount: 0,
        dollars: 0,
      },
    });
  });

  it('evaluates cache completeness for each transaction billing period', () => {
    const card = createCard({
      minimumSpend: 100,
      earningBlockSize: 5,
      billingCycle: { type: 'billing', dayOfMonth: 15 },
    });
    const projections = projectTransactions(
      [
        createTransaction({ id: 'historical', date: '2026-01-10', amount: -100_000 }),
        createTransaction({ id: 'structural', date: '2026-01-11', amount: -3_000 }),
        createTransaction({ id: 'covered', date: '2026-01-20', amount: -100_000 }),
      ],
      [card],
      {},
      undefined,
      { periodDataSinceDate: '2026-01-15' },
    );

    expect(projections[0]).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'period_incomplete',
      reward: { amount: 0, dollars: 0 },
    });
    expect(projections[1]).toMatchObject({
      status: 'no_reward',
      noRewardReason: 'below_block',
    });
    expect(projections[2]).toMatchObject({
      status: 'earning',
      noRewardReason: null,
      reward: { amount: 2, dollars: 2 },
    });
  });
});
