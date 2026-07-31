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
