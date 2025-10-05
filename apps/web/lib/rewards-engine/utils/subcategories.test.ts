import { describe, expect, it } from 'vitest';

import { UNFLAGGED_FLAG } from '@/lib/ynab-constants';
import type { CardSubcategory, CreditCard } from '@/lib/storage';

import { createSubcategoryContext, normaliseFlagColor, resolveSubcategory } from './subcategories';

const baseCard: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
  subcategoriesEnabled: true,
  subcategories: [],
};

const createSubcategory = (overrides: Partial<CardSubcategory>): CardSubcategory => ({
  id: overrides.id ?? 'sub-1',
  name: overrides.name ?? 'Subcategory',
  flagColor: overrides.flagColor ?? UNFLAGGED_FLAG.value,
  rewardValue: overrides.rewardValue ?? 2,
  milesBlockSize: overrides.milesBlockSize ?? null,
  minimumSpend: overrides.minimumSpend ?? null,
  maximumSpend: overrides.maximumSpend ?? null,
  priority: overrides.priority ?? 0,
  active: overrides.active ?? true,
  excludeFromRewards: overrides.excludeFromRewards,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

describe('normaliseFlagColor', () => {
  it('returns known flag colours case-insensitively and falls back to unflagged', () => {
    expect(normaliseFlagColor('bLuE')).toBe('blue');
    expect(normaliseFlagColor('unknown')).toBe(UNFLAGGED_FLAG.value);
    expect(normaliseFlagColor(undefined)).toBe(UNFLAGGED_FLAG.value);
  });
});

describe('createSubcategoryContext', () => {
  it('filters inactive subcategories and sorts by priority', () => {
    const card: CreditCard = {
      ...baseCard,
      subcategories: [
        createSubcategory({ id: 'b', flagColor: 'green', priority: 2 }),
        createSubcategory({ id: 'a', flagColor: 'red', priority: 1 }),
        createSubcategory({ id: 'c', flagColor: 'yellow', priority: 3, active: false }),
        createSubcategory({ id: 'fallback', flagColor: UNFLAGGED_FLAG.value, priority: 0 }),
      ],
    };

    const context = createSubcategoryContext(card);

    expect(context.enabled).toBe(true);
    expect(context.activeSubcategories.map((sub) => sub.id)).toEqual(['fallback', 'a', 'b']);
    expect(context.fallback?.id).toBe('fallback');
  });

  it('disables context when subcategories are not enabled', () => {
    const card: CreditCard = {
      ...baseCard,
      subcategoriesEnabled: false,
      subcategories: [createSubcategory({ id: 'x' })],
    };

    const context = createSubcategoryContext(card);
    expect(context.enabled).toBe(false);
    expect(context.activeSubcategories).toHaveLength(0);
  });
});

describe('resolveSubcategory', () => {
  it('returns explicit match or falls back to unflagged context', () => {
    const card: CreditCard = {
      ...baseCard,
      subcategories: [
        createSubcategory({ id: 'fallback', flagColor: UNFLAGGED_FLAG.value, priority: 0 }),
        createSubcategory({ id: 'blue', flagColor: 'blue', priority: 1 }),
      ],
    };

    const context = createSubcategoryContext(card);
    expect(resolveSubcategory(context, 'blue')?.id).toBe('blue');
    expect(resolveSubcategory(context, 'purple')?.id).toBe('fallback');
  });
});
