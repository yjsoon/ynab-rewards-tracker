import type { DashboardTransactionsCacheEntry } from './types';

export const DASHBOARD_CACHE_FRESH_WINDOW_MS = 30 * 60 * 1000;
export const DASHBOARD_TRANSACTION_CACHE_LIMIT = 500;

/**
 * Legacy cache entries predate the explicit completeness bit. Entries that
 * filled the local cap may have been truncated, so only shorter legacy
 * snapshots can be considered complete.
 */
export function isDashboardCacheEntryComplete(
  entry: Pick<DashboardTransactionsCacheEntry, 'isComplete' | 'transactions'> | undefined,
): boolean {
  if (!entry) return false;
  if (!Array.isArray(entry.transactions)) return false;
  if (typeof entry.isComplete === 'boolean') return entry.isComplete;
  return entry.transactions.length < DASHBOARD_TRANSACTION_CACHE_LIMIT;
}

/**
 * A successful full fetch can still produce a locally truncated transaction
 * preview. Its persisted calculations remain usable, and repeating the same
 * fetch cannot make the 500-row preview complete.
 */
export function isDashboardCacheEntryLocallyTruncated(
  entry: Pick<
    DashboardTransactionsCacheEntry,
    'isComplete' | 'requiresFullRefresh' | 'transactions'
  > | undefined,
): boolean {
  return Boolean(
    entry
    && entry.isComplete === false
    && entry.requiresFullRefresh !== true
    && Array.isArray(entry.transactions)
    && entry.transactions.length === DASHBOARD_TRANSACTION_CACHE_LIMIT,
  );
}

/** A trusted entry is usable without another full refresh. */
export function isDashboardCacheEntryTrusted(
  entry: DashboardTransactionsCacheEntry | undefined,
): boolean {
  return entry?.requiresFullRefresh !== true && (
    isDashboardCacheEntryComplete(entry)
    || isDashboardCacheEntryLocallyTruncated(entry)
  );
}

export function getDashboardProjectionCompleteness(
  entry: DashboardTransactionsCacheEntry | undefined,
): { periodDataComplete: boolean; periodDataSinceDate?: string } {
  return {
    periodDataComplete:
      isDashboardCacheEntryComplete(entry)
      && entry?.requiresFullRefresh !== true,
    periodDataSinceDate: entry?.sinceDate,
  };
}

function normaliseAccountIds(ids: string[]): string {
  if (ids.length === 0) {
    return '';
  }

  return [...new Set(ids)].sort().join('::');
}

function compareAccountSets(a: string[], b: string[]): boolean {
  return normaliseAccountIds(a) === normaliseAccountIds(b);
}

function sortByFetchedAt(entries: DashboardTransactionsCacheEntry[]): DashboardTransactionsCacheEntry[] {
  return [...entries].sort((a, b) => {
    const left = new Date(a.fetchedAt).getTime();
    const right = new Date(b.fetchedAt).getTime();
    return right - left;
  });
}

/**
 * Find the best matching dashboard cache entry for the given budget and tracked accounts.
 * Prefers exact account matches, falls back to any entry for the budget, sorted by freshness.
 */
export function findBestDashboardEntry(
  entries: DashboardTransactionsCacheEntry[] | undefined,
  budgetId?: string,
  trackedAccountIds: string[] = [],
): DashboardTransactionsCacheEntry | undefined {
  if (!entries || entries.length === 0 || !budgetId) {
    return undefined;
  }

  const filteredByBudget = entries.filter((entry) => entry.budgetId === budgetId);
  if (filteredByBudget.length === 0) {
    return undefined;
  }

  const exactMatches = filteredByBudget.filter((entry) =>
    compareAccountSets(entry.trackedAccountIds, trackedAccountIds),
  );

  const candidates = exactMatches.length > 0 ? exactMatches : filteredByBudget;
  return sortByFetchedAt(candidates)[0];
}

/**
 * Returns a cache only when it belongs to the current tracked-account scope.
 * Budget-level fallback entries are useful for read-only display, but must not
 * be used to publish derived calculations for a different selection.
 */
export function findExactDashboardEntry(
  entries: DashboardTransactionsCacheEntry[] | undefined,
  budgetId?: string,
  trackedAccountIds: string[] = [],
): DashboardTransactionsCacheEntry | undefined {
  const entry = findBestDashboardEntry(entries, budgetId, trackedAccountIds);
  return entry && compareAccountSets(entry.trackedAccountIds, trackedAccountIds)
    ? entry
    : undefined;
}

/**
 * Build a Map of account ID to account name from a dashboard cache entry.
 */
export function buildAccountsMap(entry: DashboardTransactionsCacheEntry | undefined): Map<string, string> {
  if (!entry) {
    return new Map();
  }

  return new Map(entry.accounts.map((account) => [account.id, account.name] as const));
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Decide whether opening the dashboard needs a transaction refresh. Besides a
 * conventional freshness window, a cache fetched before local midnight is
 * stale immediately so a new reward period never presents as current.
 */
export function shouldRefreshDashboardCache(
  entry: DashboardTransactionsCacheEntry | undefined,
  requiredSinceDate: string,
  now = new Date(),
  freshWindowMs = DASHBOARD_CACHE_FRESH_WINDOW_MS,
): boolean {
  if (
    !entry
    || !isDashboardCacheEntryTrusted(entry)
    || entry.sinceDate > requiredSinceDate
  ) {
    return true;
  }

  const fetchedAt = new Date(entry.fetchedAt);
  const fetchedTimestamp = fetchedAt.getTime();
  if (!Number.isFinite(fetchedTimestamp)) {
    return true;
  }

  if (localDateKey(fetchedAt) !== localDateKey(now)) {
    return true;
  }

  return now.getTime() - fetchedTimestamp > freshWindowMs;
}
