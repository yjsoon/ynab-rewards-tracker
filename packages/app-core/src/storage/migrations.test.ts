import { describe, expect, it, vi } from 'vitest';

import { applyStorageMigrations } from './migrations';
import { createDefaultStorage, normaliseCard } from './normalisers';
import type { MutableCard, MutableStorageData } from './internal-types';
import type { CreditCard } from './types';

function cardWithPromotion(
  promotionalPeriod: CreditCard['promotionalPeriod'],
): CreditCard {
  return {
    id: 'card-1',
    name: 'Test Card',
    issuer: 'Test Bank',
    type: 'cashback',
    ynabAccountId: 'account-1',
    featured: true,
    earningRate: 1,
    promotionalPeriod,
  };
}

describe('promotional period migration', () => {
  it('adds the historical default only to legacy records with a missing field', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15));
    try {
      const storage = createDefaultStorage() as MutableStorageData;
      storage.cards = [cardWithPromotion({ endDate: '2026-12-31' })];

      applyStorageMigrations(storage);

      expect(storage.cards[0].promotionalPeriod?.startDate).toBe('2026-07-01');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves an intentionally omitted start date through JSON reload', () => {
    const storage = createDefaultStorage() as MutableStorageData;
    storage.cards = [normaliseCard(
      cardWithPromotion({ endDate: '2026-12-31' }) as MutableCard,
    )];
    expect(storage.cards[0].promotionalPeriod?.startDate).toBeNull();
    const reloaded = JSON.parse(JSON.stringify(storage)) as MutableStorageData;

    applyStorageMigrations(reloaded);

    expect(reloaded.cards[0].promotionalPeriod).toEqual({
      startDate: null,
      endDate: '2026-12-31',
    });
  });

  it('migrates a missing promotion start after removing legacy card fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15));
    try {
      const storage = createDefaultStorage() as MutableStorageData;
      const legacyCard = cardWithPromotion({ endDate: '2026-12-31' }) as MutableCard;
      legacyCard.milesBlockSize = 5;
      storage.cards = [legacyCard];

      applyStorageMigrations(storage);

      expect(storage.cards[0].promotionalPeriod?.startDate).toBe('2026-07-01');
      expect(storage.cards[0]).not.toHaveProperty('milesBlockSize');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('earning rate migration', () => {
  it.each([
    ['zero', 0],
    ['intentional blank', null],
    ['explicit undefined', undefined],
  ])('preserves an existing %s earning rate', (_label, earningRate) => {
    const storage = createDefaultStorage() as MutableStorageData;
    storage.cards = [{
      ...cardWithPromotion(undefined),
      earningRate,
    } as MutableCard];

    applyStorageMigrations(storage);

    expect(storage.cards[0].earningRate).toBe(earningRate);
  });

  it('fills only an absent legacy earning rate and preserves a zero rule rate', () => {
    const storage = createDefaultStorage() as MutableStorageData;
    const legacyCard = cardWithPromotion(undefined) as MutableCard;
    Reflect.deleteProperty(legacyCard, 'earningRate');
    storage.cards = [legacyCard];
    storage.rules = [{
      id: 'rule-1',
      cardId: legacyCard.id,
      name: 'No earn',
      rewardType: 'cashback',
      rewardValue: 0,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      priority: 0,
    }];

    applyStorageMigrations(storage);

    expect(storage.cards[0].earningRate).toBe(0);
  });

  it('normalises an explicit undefined rate to a JSON-stable blank', () => {
    const card = cardWithPromotion(undefined) as MutableCard;
    card.earningRate = undefined;

    const normalised = normaliseCard(card);
    const reloaded = JSON.parse(JSON.stringify(normalised)) as CreditCard;

    expect(normalised.earningRate).toBeNull();
    expect(reloaded).toHaveProperty('earningRate', null);
  });
});
