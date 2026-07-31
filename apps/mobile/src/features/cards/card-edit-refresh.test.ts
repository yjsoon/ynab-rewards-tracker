import { describe, expect, it } from 'vitest';

import { planCardEditRefresh } from './card-edit-refresh';
import type { DashboardTransactionsCacheEntry } from '@ynab-counter/app-core/storage';

function cache(
  overrides: Partial<DashboardTransactionsCacheEntry> = {},
): DashboardTransactionsCacheEntry {
  return {
    budgetId: 'budget-1',
    sinceDate: '2026-07-01',
    fetchedAt: '2026-08-01T00:00:00.000Z',
    trackedAccountIds: ['account-1'],
    transactions: [],
    accounts: [],
    isComplete: true,
    ...overrides,
  };
}

describe('planCardEditRefresh', () => {
  it('publishes locally when a complete cache covers the edited reward period', () => {
    expect(planCardEditRefresh({
      cacheEntry: cache(),
      nextPeriodStart: '2026-07-01',
      rewardConfigurationChanged: true,
    })).toEqual({
      needsFullPeriodRefresh: false,
      publishCalculationsLocally: true,
    });
  });

  it('does not publish locally when an edit expands the period before the cache boundary', () => {
    expect(planCardEditRefresh({
      cacheEntry: cache(),
      nextPeriodStart: '2026-06-18',
      rewardConfigurationChanged: true,
    })).toEqual({
      needsFullPeriodRefresh: true,
      publishCalculationsLocally: false,
    });
  });
});
