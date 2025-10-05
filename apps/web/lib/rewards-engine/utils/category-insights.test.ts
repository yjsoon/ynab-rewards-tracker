import { describe, expect, it } from 'vitest';

import type {
  CardSubcategory,
  CreditCard,
  RewardCalculation,
  SubcategoryReference,
  ThemeGroup,
} from '@/lib/storage';

import type { CategoryCardInsight } from '../types';
import {
  buildCardEntries,
  createSubcategoryInsight,
  createWholeCardInsight,
} from './category-insights';

const createSubcategory = (overrides: Partial<CardSubcategory>): CardSubcategory => ({
  id: 'subcategory-1',
  name: 'Dining',
  flagColor: 'red',
  rewardValue: 3,
  milesBlockSize: null,
  minimumSpend: null,
  maximumSpend: null,
  priority: 1,
  active: true,
  excludeFromRewards: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const baseCard: CreditCard = {
  id: 'card-1',
  name: 'Rewards Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
};

const milesCard: CreditCard = {
  ...baseCard,
  id: 'card-2',
  name: 'Miles Card',
  type: 'miles',
  earningRate: 1.5,
  minimumSpend: 400,
  maximumSpend: 600,
  subcategoriesEnabled: true,
  subcategories: [
    createSubcategory({
      id: 'dining',
      name: 'Dining',
      flagColor: 'blue',
      minimumSpend: 100,
      maximumSpend: 200,
    }),
    createSubcategory({
      id: 'grocery',
      name: 'Grocery',
      flagColor: 'green',
      maximumSpend: 150,
    }),
  ],
};

describe('buildCardEntries', () => {
  it('groups card and subcategory references by card id', () => {
    const group: ThemeGroup = {
      id: 'group-1',
      name: 'Dining Focus',
      description: 'Dining themed cards',
      colour: 'blue',
      priority: 1,
      subcategories: [
        { cardId: 'card-2', subcategoryId: 'dining' },
        { cardId: 'card-2', subcategoryId: 'grocery' },
      ],
      cards: [{ cardId: 'card-1' }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    const entries = buildCardEntries(group);
    expect(entries.size).toBe(2);

    const milesEntry = entries.get('card-2');
    expect(milesEntry?.refs).toHaveLength(2);
    expect(milesEntry?.includeWhole).toBe(false);

    const cashEntry = entries.get('card-1');
    expect(cashEntry?.refs).toHaveLength(0);
    expect(cashEntry?.includeWhole).toBe(true);
  });
});

describe('createWholeCardInsight', () => {
  it('derives insight metrics from calculation data', () => {
    const calculation: RewardCalculation = {
      cardId: baseCard.id,
      ruleId: 'card-card-1',
      period: '2025-02',
      totalSpend: 200,
      eligibleSpend: 180,
      rewardEarned: 3.6,
      rewardEarnedDollars: 3.6,
      rewardType: 'cashback',
      minimumMet: false,
      maximumExceeded: false,
      shouldStopUsing: false,
      minimumProgress: 60,
      maximumProgress: 30,
    };

    const insight = createWholeCardInsight(
      { ...baseCard, earningRate: 2, minimumSpend: 300, maximumSpend: 500 },
      calculation,
      0.01
    );

    expect(insight.rewardRate).toBeCloseTo(0.018, 3);
    expect(insight.minimumMet).toBe(false);
    expect(insight.headroomToMaximum).toBeCloseTo(320);
    expect(insight.status).toBe('consider');
    expect(insight.shouldAvoid).toBe(false);
    expect(insight.cardMaximumCap).toBe(500);
  });
});

describe('createSubcategoryInsight', () => {
  it('aggregates subcategory breakdowns and reflects constraints', () => {
    const calculation: RewardCalculation = {
      cardId: milesCard.id,
      ruleId: 'card-card-2',
      period: '2025-03',
      totalSpend: 350,
      eligibleSpend: 330,
      rewardEarned: 0,
      rewardType: 'miles',
      minimumMet: true,
      maximumExceeded: false,
      shouldStopUsing: false,
      minimumProgress: 75,
      maximumProgress: 70,
      subcategoryBreakdowns: [
        {
          subcategoryId: 'dining',
          name: 'Dining',
          flagColor: 'blue',
          totalSpend: 200,
          eligibleSpend: 200,
          eligibleSpendBeforeBlocks: 220,
          rewardEarned: 300,
          minimumSpendMet: true,
          maximumSpendExceeded: true,
        },
        {
          subcategoryId: 'grocery',
          name: 'Grocery',
          flagColor: 'green',
          totalSpend: 50,
          eligibleSpend: 50,
          eligibleSpendBeforeBlocks: 50,
          rewardEarned: 75,
          minimumSpendMet: false,
          maximumSpendExceeded: false,
        },
      ],
    } as RewardCalculation;

    const refs: SubcategoryReference[] = [
      { cardId: milesCard.id, subcategoryId: 'dining' },
      { cardId: milesCard.id, subcategoryId: 'grocery' },
    ];

    const insight = createSubcategoryInsight(milesCard, calculation, refs, 0.02);

    expect(insight).not.toBeNull();
    const resolved = insight as CategoryCardInsight;
    expect(resolved.totalSpend).toBe(250);
    expect(resolved.rewardEarnedDollars).toBeCloseTo(7.5, 3);
    expect(resolved.minimumTarget).toBe(100);
    expect(resolved.minimumMet).toBe(true);
    expect(resolved.headroomToMaximum).toBe(0);
    expect(resolved.shouldAvoid).toBe(true);
    expect(resolved.status).toBe('avoid');
    expect(resolved.cardMinimumMet).toBe(true);
    expect(resolved.cardMaximumCap).toBe(600);
  });

  it('returns null when card subcategories are unavailable', () => {
    const refs: SubcategoryReference[] = [{ cardId: baseCard.id, subcategoryId: 'dining' }];
    const insight = createSubcategoryInsight(baseCard, undefined, refs, 0.01);
    expect(insight).toBeNull();
  });
});
