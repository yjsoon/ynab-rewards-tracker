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

  it('collapses multiple current-period rule rows to one canonical aggregate', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const fixture = createDemoStorageFixture(now);
    const cacheEntry = fixture.cachedData.dashboardTransactions![0];
    const emberCalculation = fixture.calculations.find(
      (calculation) => calculation.cardId === 'demo-card-ember',
    )!;
    const staleSecondaryRule = {
      ...emberCalculation,
      ruleId: 'demo-rule-ember-secondary',
      totalSpend: -1,
      rewardEarned: -1,
    };
    const historicalCalculation = {
      ...emberCalculation,
      ruleId: 'demo-rule-ember-historical',
      period: '2026-07-01 → 2026-07-31',
      totalSpend: 321,
    };

    const publication = createLocalFlagUpdatePublication({
      cacheEntry,
      cards: fixture.cards,
      settings: fixture.settings,
      calculations: [
        ...fixture.calculations,
        staleSecondaryRule,
        historicalCalculation,
      ],
      now,
    });

    const currentEmberRows = publication.calculations.filter((calculation) => (
      calculation.cardId === 'demo-card-ember'
      && calculation.period === emberCalculation.period
    ));
    expect(currentEmberRows).toHaveLength(1);
    expect(currentEmberRows[0]).toMatchObject({
      ruleId: 'card-demo-card-ember',
      totalSpend: emberCalculation.totalSpend,
      rewardEarned: emberCalculation.rewardEarned,
    });
    expect(publication.calculations).toContainEqual(historicalCalculation);
  });
});
