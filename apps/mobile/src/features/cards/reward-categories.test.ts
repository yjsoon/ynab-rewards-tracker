import { describe, expect, it } from 'vitest';

import { buildRewardsDashboard } from '@ynab-counter/app-core/rewards-engine';
import type { CreditCard, Transaction } from '@ynab-counter/app-core/storage';
import { createDemoStorageFixture } from '@/lib/demo-data';

import { rankCardUses } from './reward-categories';

function demoDashboard() {
  const now = new Date('2026-08-02T12:00:00');
  const fixture = createDemoStorageFixture(now);
  const transactions = fixture.cachedData.dashboardTransactions?.[0]?.transactions ?? [];
  return {
    fixture,
    dashboard: buildRewardsDashboard(fixture.cards, transactions, fixture.settings, now),
  };
}

describe('rankCardUses', () => {
  it('ranks factual earning options without returning capped cards', () => {
    const { dashboard, fixture } = demoDashboard();

    const uses = rankCardUses(dashboard.cards, fixture.settings);

    expect(uses.map((item) => item.card.card.id)).toEqual([
      'demo-card-orbit',
      'demo-card-ember',
      'demo-card-tide',
    ]);
    expect(uses.map((item) => [item.use.label, item.rankGroup])).toEqual([
      ['Everyday spend', 'current'],
      ['Groceries', 'building'],
      ['Everyday spend', 'cap_limited'],
    ]);
    expect(uses.some((item) => item.card.card.id === 'demo-card-summit')).toBe(false);
  });

  it('does not invent everyday spend when enabled tiers are unavailable', () => {
    const { dashboard, fixture } = demoDashboard();
    const ember = dashboard.cards.find((item) => item.card.id === 'demo-card-ember');
    expect(ember).toBeDefined();

    const uses = rankCardUses([{
      ...ember!,
      rewardCategories: ember!.rewardCategories.map((category) => ({
        ...category,
        excluded: true,
      })),
    }], fixture.settings);

    expect(uses).toEqual([]);
  });

  it('ranks a card using its active spend-tier rate', () => {
    const card: CreditCard = {
      id: 'tiered-card',
      name: 'Tiered Card',
      issuer: 'Issuer',
      type: 'cashback',
      ynabAccountId: 'tiered-account',
      featured: true,
      earningRate: 6,
      minimumSpend: 50,
      maximumSpend: 100,
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 8,
        maximumSpend: 150,
      }],
    };
    const transaction: Transaction = {
      id: 'tiered-spend',
      account_id: card.ynabAccountId,
      amount: -120_000,
      date: '2026-08-01',
    };
    const dashboard = buildRewardsDashboard(
      [card],
      [transaction],
      {},
      new Date('2026-08-02T12:00:00'),
    );

    const uses = rankCardUses(dashboard.cards, {});

    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      card: { card: { id: card.id } },
      rate: { value: 8, normalized: 0.08 },
      effectiveEarningRoom: 30,
    });
  });

  it('uses the reached rate and next-target cap room between thresholds', () => {
    const card: CreditCard = {
      id: 'tiered-card',
      name: 'Tiered Card',
      issuer: 'Issuer',
      type: 'cashback',
      ynabAccountId: 'tiered-account',
      featured: true,
      earningRate: 6,
      minimumSpend: 50,
      maximumSpend: 20,
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 8,
        maximumSpend: 100,
      }],
    };
    const dashboard = buildRewardsDashboard(
      [card],
      [{
        id: 'tiered-spend',
        account_id: card.ynabAccountId,
        amount: -80_000,
        date: '2026-08-01',
      }],
      {},
      new Date('2026-08-02T12:00:00'),
    );

    expect(rankCardUses(dashboard.cards, {})).toMatchObject([{
      card: { card: { id: card.id } },
      rankGroup: 'current',
      rate: { value: 6, prospective: false },
      effectiveEarningRoom: 20,
      operational: { kind: 'cap', remaining: 20 },
    }]);
  });

  it('omits a next-tier option when current spend has already consumed its cap', () => {
    const card: CreditCard = {
      id: 'tiered-card',
      name: 'Tiered Card',
      issuer: 'Issuer',
      type: 'cashback',
      ynabAccountId: 'tiered-account',
      featured: true,
      earningRate: 6,
      minimumSpend: 50,
      maximumSpend: 20,
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 8,
        maximumSpend: 30,
      }],
    };
    const dashboard = buildRewardsDashboard(
      [card],
      [{
        id: 'tiered-spend',
        account_id: card.ynabAccountId,
        amount: -80_000,
        date: '2026-08-01',
      }],
      {},
      new Date('2026-08-02T12:00:00'),
    );

    expect(rankCardUses(dashboard.cards, {})).toEqual([]);
  });

  it('falls back to a prospective category that still has cap room', () => {
    const timestamp = '2026-08-01T00:00:00.000Z';
    const card: CreditCard = {
      id: 'category-tiered-card',
      name: 'Category Tiered Card',
      issuer: 'Issuer',
      type: 'cashback',
      ynabAccountId: 'category-tiered-account',
      featured: true,
      earningRate: 1,
      maximumSpend: 20,
      subcategoriesEnabled: true,
      subcategories: [{
        id: 'category-a',
        name: 'Category A',
        flagColor: 'orange',
        rewardValue: 6,
        maximumSpend: 20,
        priority: 0,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }, {
        id: 'category-b',
        name: 'Category B',
        flagColor: 'blue',
        rewardValue: 5,
        maximumSpend: 20,
        priority: 1,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      spendingTiers: [{
        id: 'high-spend',
        spendThreshold: 100,
        earningRate: 1,
        maximumSpend: 100,
        subcategories: [{
          subcategoryId: 'category-a',
          rewardValue: 8,
          maximumSpend: 30,
        }, {
          subcategoryId: 'category-b',
          rewardValue: 5,
          maximumSpend: 100,
        }],
      }],
    };
    const dashboard = buildRewardsDashboard(
      [card],
      [{
        id: 'category-a-spend',
        account_id: card.ynabAccountId,
        amount: -40_000,
        date: '2026-08-01',
        flag_color: 'orange',
      }, {
        id: 'category-b-spend',
        account_id: card.ynabAccountId,
        amount: -40_000,
        date: '2026-08-01',
        flag_color: 'blue',
      }],
      {},
      new Date('2026-08-02T12:00:00'),
    );

    expect(rankCardUses(dashboard.cards, {})).toMatchObject([{
      use: { label: 'Category B', flagColor: 'blue' },
      rankGroup: 'building',
      rate: { value: 5, prospective: true },
      effectiveEarningRoom: 20,
      operational: { kind: 'minimum', remaining: 20 },
    }]);
  });

  it.each([
    { remaining: 5, expected: true },
    { remaining: 2, expected: false },
  ])('keeps a block card only when a whole block fits with $remaining room', ({
    remaining,
    expected,
  }) => {
    const { dashboard, fixture } = demoDashboard();
    const orbit = dashboard.cards.find((item) => item.card.id === 'demo-card-orbit');
    expect(orbit).toBeDefined();

    const uses = rankCardUses([{
      ...orbit!,
      status: 'near_cap',
      maximum: {
        ...orbit!.maximum,
        target: 1_000,
        remaining,
        reached: false,
      },
    }], fixture.settings);

    expect(uses.length > 0).toBe(expected);
  });

  it.each([100, 80, 79])(
    'keeps card-wide minimum guidance with %d selected-tier cap room',
    (room) => {
      const { dashboard, fixture } = demoDashboard();
      const ember = dashboard.cards.find((item) => item.card.id === 'demo-card-ember');
      expect(ember).toBeDefined();

      const uses = rankCardUses([{
        ...ember!,
        status: 'near_cap',
        maximum: {
          ...ember!.maximum,
          target: 500,
          remaining: room,
          reached: false,
        },
      }], fixture.settings);

      expect(uses).toHaveLength(1);
      expect(uses[0]?.rankGroup).toBe('building');
    },
  );

  it('recommends the strongest prospective tier when every tier minimum is unmet', () => {
    const { dashboard, fixture } = demoDashboard();
    const ember = dashboard.cards.find((item) => item.card.id === 'demo-card-ember');
    expect(ember).toBeDefined();

    const uses = rankCardUses([{
      ...ember!,
      minimum: {
        target: null,
        remaining: null,
        progress: null,
        met: null,
      },
      rewardCategories: ember!.rewardCategories.map((category) => ({
        ...category,
        minimum: {
          target: 500,
          remaining: 500 - category.spend.total,
          progress: category.spend.total / 500,
          met: false,
        },
      })),
    }], fixture.settings);

    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      use: { label: 'Groceries' },
      rate: { prospective: true },
      rankGroup: 'building',
      operational: {
        kind: 'minimum',
        remaining: 375,
        category: 'Groceries',
      },
    });
  });
});
