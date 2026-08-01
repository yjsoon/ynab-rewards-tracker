import { describe, expect, it } from 'vitest';

import type { DashboardTransactionsCacheEntry } from './types';
import {
  DASHBOARD_TRANSACTION_CACHE_LIMIT,
  findExactDashboardEntry,
  getDashboardProjectionCompleteness,
  isDashboardCacheEntryComplete,
  isDashboardCacheEntryTrusted,
  shouldRefreshDashboardCache,
} from './dashboardCache';

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

  it('refreshes a fresh legacy cache inferred incomplete at the row cap', () => {
    expect(shouldRefreshDashboardCache(
      cache({
        transactions: Array.from(
          { length: DASHBOARD_TRANSACTION_CACHE_LIMIT },
          (_, index) => ({
            id: `transaction-${index}`,
            date: '2026-07-01',
            amount: -100,
            account_id: 'account-1',
          }),
        ),
      }),
      '2026-07-01',
      new Date('2026-07-10T10:10:00.000Z'),
    )).toBe(true);
  });
});

describe('legacy dashboard cache completeness', () => {
  it('rejects malformed transactions even when explicitly marked complete', () => {
    const malformed = {
      ...cache(),
      transactions: undefined,
    } as unknown as DashboardTransactionsCacheEntry;

    expect(isDashboardCacheEntryComplete(malformed)).toBe(false);
    expect(isDashboardCacheEntryComplete({ ...malformed, isComplete: false })).toBe(false);
    expect(isDashboardCacheEntryComplete({ ...malformed, isComplete: true })).toBe(false);
    expect(isDashboardCacheEntryTrusted({ ...malformed, isComplete: true })).toBe(false);
    expect(shouldRefreshDashboardCache(
      { ...malformed, isComplete: true },
      '2026-07-01',
      new Date('2026-07-10T10:10:00.000Z'),
    )).toBe(true);
  });

  it('treats an unmarked entry at the row cap as incomplete', () => {
    const entry = cache({
      transactions: Array.from(
        { length: DASHBOARD_TRANSACTION_CACHE_LIMIT },
        (_, index) => ({
          id: `transaction-${index}`,
          date: '2026-07-01',
          amount: -100,
          account_id: 'account-1',
        }),
      ),
    });

    expect(isDashboardCacheEntryComplete(entry)).toBe(false);
    expect(isDashboardCacheEntryTrusted(entry)).toBe(false);
    expect(getDashboardProjectionCompleteness(entry)).toEqual({
      periodDataComplete: false,
      periodDataSinceDate: '2026-07-01',
    });
  });

  it('trusts explicit completeness and carries the cache boundary to projections', () => {
    const entry = cache({
      sinceDate: '2026-06-18',
      isComplete: true,
      transactions: Array.from(
        { length: DASHBOARD_TRANSACTION_CACHE_LIMIT },
        (_, index) => ({
          id: `transaction-${index}`,
          date: '2026-07-01',
          amount: -100,
          account_id: 'account-1',
        }),
      ),
    });

    expect(isDashboardCacheEntryComplete(entry)).toBe(true);
    expect(isDashboardCacheEntryTrusted(entry)).toBe(true);
    expect(getDashboardProjectionCompleteness(entry)).toEqual({
      periodDataComplete: true,
      periodDataSinceDate: '2026-06-18',
    });
  });

  it('does not trust an explicitly complete entry marked for full refresh', () => {
    const entry = cache({ isComplete: true, requiresFullRefresh: true });

    expect(isDashboardCacheEntryComplete(entry)).toBe(true);
    expect(isDashboardCacheEntryTrusted(entry)).toBe(false);
  });
});

describe('dashboard cache publication scope', () => {
  it('rejects a same-budget fallback when tracked accounts do not match', () => {
    const oldSelection = cache({
      trackedAccountIds: ['account-1'],
      isComplete: true,
    });

    expect(findExactDashboardEntry(
      [oldSelection],
      'budget-1',
      ['account-2'],
    )).toBeUndefined();
    expect(findExactDashboardEntry(
      [oldSelection],
      'budget-1',
      ['account-1'],
    )).toBe(oldSelection);
  });
});
