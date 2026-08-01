import { describe, expect, it } from 'vitest';

import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import type { CardSubcategory, CreditCard, ThemeGroup } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';

import { RealTimeRecommendations } from './real-time-recommendations';

const createSubcategory = (
  overrides: Partial<CardSubcategory>
): CardSubcategory => ({
  id: overrides.id ?? 'subcategory-1',
  name: overrides.name ?? 'Subcategory',
  flagColor: overrides.flagColor ?? 'unflagged',
  rewardValue: overrides.rewardValue ?? 2,
  milesBlockSize: overrides.milesBlockSize ?? null,
  minimumSpend: overrides.minimumSpend ?? null,
  maximumSpend: overrides.maximumSpend ?? null,
  priority: overrides.priority ?? 0,
  active: overrides.active ?? true,
  excludeFromRewards: overrides.excludeFromRewards ?? false,
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
});

const createCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: overrides.id ?? 'card-1',
  name: overrides.name ?? 'Rewards Card',
  issuer: overrides.issuer ?? 'Issuer',
  type: overrides.type ?? 'cashback',
  ynabAccountId: overrides.ynabAccountId ?? 'account-1',
  featured: overrides.featured ?? true,
  earningRate: overrides.earningRate ?? 1.5,
  subcategoriesEnabled: overrides.subcategoriesEnabled ?? true,
  subcategories: overrides.subcategories ?? [],
  ...overrides,
});

const createTheme = (overrides: Partial<ThemeGroup> = {}): ThemeGroup => ({
  id: overrides.id ?? 'theme-1',
  name: overrides.name ?? 'Theme',
  description: overrides.description ?? 'Theme description',
  colour: overrides.colour ?? 'blue',
  priority: overrides.priority ?? 1,
  cards: overrides.cards ?? [],
  subcategories: overrides.subcategories ?? [],
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
});

const createTransaction = (
  overrides: Partial<Transaction> = {}
): Transaction => ({
  id: overrides.id ?? 'txn-1',
  date: overrides.date ?? '2026-01-01',
  amount: overrides.amount ?? -1000,
  account_id: overrides.account_id ?? 'account-1',
  payee_name: overrides.payee_name ?? 'Merchant',
  category_name: overrides.category_name ?? 'Category',
  approved: overrides.approved ?? true,
  flag_color: overrides.flag_color ?? null,
  cleared: overrides.cleared ?? 'cleared',
  memo: overrides.memo ?? null,
  flag_name: overrides.flag_name ?? null,
  subtransactions: overrides.subtransactions,
});

describe('RealTimeRecommendations', () => {
  it.each([null, undefined])('treats a blank %s base rate as unconfigured', (earningRate) => {
    const card = createCard({
      earningRate,
      subcategoriesEnabled: false,
    });
    const theme = createTheme({ cards: [{ cardId: card.id }] });

    const [recommendation] = new RealTimeRecommendations().generateRecommendations(
      [theme],
      [card],
      [],
    );

    const option = [
      recommendation.bestCard,
      ...recommendation.alternatives,
      ...recommendation.notRecommended,
    ].find((candidate) => candidate?.cardId === card.id);
    expect(option?.effectiveRate).toBe(0);
    expect(option?.earningRate).toBeUndefined();
    expect(option?.reasons).not.toContain('1.0% reward rate');
  });

  it('uses the shared unflagged fallback when a transaction flag is unknown', () => {
    const card = createCard({
      subcategories: [
        createSubcategory({
          id: 'fallback',
          name: 'Fallback',
          flagColor: 'unflagged',
          rewardValue: 3,
          priority: 0,
        }),
        createSubcategory({
          id: 'blue',
          name: 'Blue',
          flagColor: 'blue',
          rewardValue: 5,
          priority: 1,
        }),
      ],
    });
    const period = SimpleRewardsCalculator.calculatePeriod(card);
    const theme = createTheme({
      subcategories: [{ cardId: card.id, subcategoryId: 'fallback' }],
    });
    const transactions = [
      createTransaction({
        account_id: card.ynabAccountId,
        amount: -12000,
        date: period.start,
        flag_color: 'purple',
      }),
    ];

    const [recommendation] = new RealTimeRecommendations().generateRecommendations(
      [theme],
      [card],
      transactions
    );

    expect(recommendation.bestCard?.cardId).toBe(card.id);
    expect(recommendation.bestCard?.subcategoryProgress).toEqual([
      expect.objectContaining({
        subcategoryId: 'fallback',
        currentSpend: 12,
      }),
    ]);
  });

  it('continues to ignore spending for excluded subcategories', () => {
    const card = createCard({
      subcategories: [
        createSubcategory({
          id: 'excluded',
          name: 'Excluded',
          flagColor: 'red',
          excludeFromRewards: true,
          priority: 0,
        }),
        createSubcategory({
          id: 'fallback',
          name: 'Fallback',
          flagColor: 'unflagged',
          rewardValue: 2,
          priority: 1,
        }),
      ],
    });
    const period = SimpleRewardsCalculator.calculatePeriod(card);
    const theme = createTheme({
      cards: [{ cardId: card.id }],
    });
    const transactions = [
      createTransaction({
        id: 'excluded-txn',
        account_id: card.ynabAccountId,
        amount: -15000,
        date: period.start,
        flag_color: 'red',
      }),
      createTransaction({
        id: 'counted-txn',
        account_id: card.ynabAccountId,
        amount: -8000,
        date: period.end,
        flag_color: null,
      }),
    ];

    const [recommendation] = new RealTimeRecommendations().generateRecommendations(
      [theme],
      [card],
      transactions
    );

    expect(recommendation.bestCard?.cardId).toBe(card.id);
    expect(recommendation.bestCard?.currentSpend).toBe(8);
  });

  it('ignores positive YNAB credits when calculating spend summaries', () => {
    const card = createCard({ subcategoriesEnabled: false });
    const period = SimpleRewardsCalculator.calculatePeriod(card);
    const theme = createTheme({
      cards: [{ cardId: card.id }],
    });
    const transactions = [
      createTransaction({
        id: 'purchase',
        account_id: card.ynabAccountId,
        amount: -100000,
        date: period.start,
      }),
      createTransaction({
        id: 'refund',
        account_id: card.ynabAccountId,
        amount: 80000,
        date: period.start,
      }),
    ];

    const [recommendation] = new RealTimeRecommendations().generateRecommendations(
      [theme],
      [card],
      transactions
    );

    expect(recommendation.bestCard?.currentSpend).toBe(100);
  });

  it('keeps a card eligible when only one linked subcategory is maxed', () => {
    const maxedSubcategory = createSubcategory({
      id: 'red',
      name: 'Red',
      flagColor: 'red',
      rewardValue: 1,
      maximumSpend: 10,
    });
    const openSubcategory = createSubcategory({
      id: 'blue',
      name: 'Blue',
      flagColor: 'blue',
      rewardValue: 5,
      maximumSpend: 100,
    });
    const card = createCard({
      subcategories: [maxedSubcategory, openSubcategory],
    });
    const period = SimpleRewardsCalculator.calculatePeriod(card);
    const theme = createTheme({
      subcategories: [
        { cardId: card.id, subcategoryId: maxedSubcategory.id },
        { cardId: card.id, subcategoryId: openSubcategory.id },
      ],
    });
    const transactions = [
      createTransaction({
        id: 'maxed-red',
        account_id: card.ynabAccountId,
        amount: -10000,
        date: period.start,
        flag_color: 'red',
      }),
      createTransaction({
        id: 'open-blue',
        account_id: card.ynabAccountId,
        amount: -5000,
        date: period.start,
        flag_color: 'blue',
      }),
    ];

    const [recommendation] = new RealTimeRecommendations().generateRecommendations(
      [theme],
      [card],
      transactions
    );

    expect(recommendation.bestCard?.cardId).toBe(card.id);
    expect(recommendation.bestCard?.recommendation).not.toBe('avoid');
    expect(recommendation.bestCard?.effectiveRate).toBe(0.05);
    expect(recommendation.bestCard?.subcategoryProgress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subcategoryId: 'red', isMaxed: true }),
        expect.objectContaining({ subcategoryId: 'blue', isMaxed: false }),
      ])
    );
  });
});
