import { describe, expect, it } from 'vitest';

import { createDemoStorageFixture } from '@/lib/demo-data';
import { createLocalFlagUpdatePublication } from './flag-update-publication';

describe('demo flag update publication', () => {
  it('keeps the edited flag and republishes its derived card calculation', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const fixture = createDemoStorageFixture(now);
    const originalCacheEntry = fixture.cachedData.dashboardTransactions![0];
    const originalCalculation = fixture.calculations.find(
      (calculation) => calculation.cardId === 'demo-card-ember',
    )!;
    const editedCacheEntry = {
      ...originalCacheEntry,
      transactions: originalCacheEntry.transactions.map((transaction) => (
        transaction.id === 'demo-transaction-ember-fee'
          ? { ...transaction, flag_color: 'orange' as const, flag_name: 'Bonus · Groceries' }
          : transaction
      )),
    };

    const publication = createLocalFlagUpdatePublication({
      cacheEntry: editedCacheEntry,
      cards: fixture.cards,
      settings: fixture.settings,
      calculations: fixture.calculations,
      now,
    });

    expect(publication.cacheEntry.transactions.find(
      (transaction) => transaction.id === 'demo-transaction-ember-fee',
    )).toMatchObject({
      flag_color: 'orange',
      flag_name: 'Bonus · Groceries',
    });
    const updatedCalculation = publication.calculations.find(
      (calculation) => calculation.cardId === 'demo-card-ember',
    )!;
    expect(updatedCalculation.totalSpend).toBeGreaterThan(originalCalculation.totalSpend);
    expect(updatedCalculation.subcategoryBreakdowns?.find(
      (breakdown) => breakdown.flagColor === 'red',
    )?.totalSpend).toBe(0);
  });
});
