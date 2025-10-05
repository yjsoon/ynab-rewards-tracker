import { describe, expect, it } from 'vitest';

import { UNFLAGGED_FLAG } from '@/lib/ynab-constants';

import {
  createDefaultStorage,
  normaliseCard,
  normaliseHiddenCards,
  normaliseThemeGroup,
  pruneThemeGroups,
} from './normalisers';
import type { MutableCard, MutableStorageData, MutableThemeGroup } from './internal-types';
import type { CreditCard, ThemeGroup } from './types';

describe('normaliseCard', () => {
  it('deduplicates subcategories by flag colour and ensures unflagged entry exists when enabled', () => {
    const rawCard: Partial<CreditCard> = {
      id: 'card-1',
      name: 'Test Card',
      issuer: 'Issuer',
      type: 'cashback',
      ynabAccountId: 'acct-1',
      featured: true,
      earningRate: 2,
      subcategoriesEnabled: true,
      subcategories: [
        {
          id: 'dup-1',
          name: 'Duplicate',
          flagColor: 'blue',
          rewardValue: 3,
          priority: 0,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'dup-2',
          name: 'Duplicate Two',
          flagColor: 'blue',
          rewardValue: 4,
          priority: 1,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as unknown as CreditCard['subcategories'],
    };

    const card = normaliseCard(rawCard as MutableCard, {});

    expect(card.subcategories).toHaveLength(2);
    const [first, second] = card.subcategories ?? [];
    expect(first.flagColor).toBe('blue');
    expect(second.flagColor).toBe(UNFLAGGED_FLAG.value);
    expect(second.rewardValue).toBe(rawCard.earningRate);
  });
});

describe('normaliseHiddenCards', () => {
  it('filters invalid and expired entries while keeping the latest expiry per card', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const soon = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    const hidden = normaliseHiddenCards([
      null,
      { cardId: 'a', hiddenUntil: past },
      { cardId: 'a', hiddenUntil: soon },
      { cardId: 'a', hiddenUntil: later },
      { cardId: 'b', hiddenUntil: 'invalid' },
      { cardId: 'b', hiddenUntil: later },
    ]);

    expect(hidden).toEqual([
      { cardId: 'a', hiddenUntil: later, reason: 'maximum_spend_reached' },
      { cardId: 'b', hiddenUntil: later, reason: 'maximum_spend_reached' },
    ]);
  });
});

describe('pruneThemeGroups', () => {
  it('normalises groups and removes invalid references', () => {
    const storage = createDefaultStorage() as MutableStorageData;
    const card: CreditCard = {
      id: 'card-1',
      name: 'Card',
      issuer: 'Issuer',
      type: 'cashback',
      ynabAccountId: 'acct',
      featured: true,
      earningRate: 2,
      subcategoriesEnabled: true,
      subcategories: [
        {
          id: 'sub-1',
          name: 'Dining',
          flagColor: 'blue',
          rewardValue: 2,
          priority: 0,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    storage.cards.push(card);

    const group: Partial<ThemeGroup> = {
      id: 'group-1',
      name: 'Group',
      priority: 0,
      subcategories: [
        { cardId: 'card-1', subcategoryId: 'sub-1' },
        { cardId: 'card-1', subcategoryId: 'missing' },
      ],
      cards: [{ cardId: 'card-1' }, { cardId: 'unknown' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const normalisedGroup = normaliseThemeGroup(group as MutableThemeGroup, storage, 0);
    storage.themeGroups.push(normalisedGroup);

    pruneThemeGroups(storage);

    expect(storage.themeGroups).toHaveLength(1);
    expect(storage.themeGroups[0].subcategories).toEqual([
      { cardId: 'card-1', subcategoryId: 'sub-1' },
    ]);
    expect(storage.themeGroups[0].cards).toEqual([{ cardId: 'card-1' }]);
  });
});
