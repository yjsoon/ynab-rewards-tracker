import { describe, expect, it } from 'vitest';

import type { DashboardTransactionsCacheEntry } from './types';
import { shouldRefreshDashboardCache } from './dashboardCache';

function cache(overrides: Partial<DashboardTransactionsCacheEntry> = {}): DashboardTransactionsCacheEntry {
  return {
    budgetId: 'budget-1',
    sinceDate: '2026-07-01',
    fetchedAt: '2026-07-10T10:00:00.000Z',
    trackedAccountIds: ['account-1'],
    transactions: [],
    accounts: [],
    ...overrides,
  };
}

describe('shouldRefreshDashboardCache', () => {
  it('keeps a fresh cache that covers the required reward period', () => {
    expect(shouldRefreshDashboardCache(
      cache(),
      '2026-07-01',
      new Date('2026-07-10T10:10:00.000Z'),
    )).toBe(false);
  });

  it('refreshes missing, stale, and insufficiently broad caches', () => {
    const now = new Date('2026-07-10T11:00:01.000Z');
    expect(shouldRefreshDashboardCache(undefined, '2026-07-01', now)).toBe(true);
    expect(shouldRefreshDashboardCache(cache(), '2026-07-01', now)).toBe(true);
    expect(shouldRefreshDashboardCache(
      cache({ sinceDate: '2026-07-05' }),
      '2026-07-01',
      new Date('2026-07-10T10:10:00.000Z'),
    )).toBe(true);
  });

  it('refreshes across local midnight even inside the normal freshness window', () => {
    const fetchedAt = new Date(2026, 6, 10, 23, 55);
    const now = new Date(2026, 6, 11, 0, 5);
    expect(shouldRefreshDashboardCache(
      cache({ fetchedAt: fetchedAt.toISOString() }),
      '2026-07-01',
      now,
    )).toBe(true);
  });

  it('refreshes a cache durably marked after reward configuration changes', () => {
    expect(shouldRefreshDashboardCache(
      cache({ requiresFullRefresh: true }),
      '2026-07-01',
      new Date('2026-07-10T10:10:00.000Z'),
    )).toBe(true);
  });
});
