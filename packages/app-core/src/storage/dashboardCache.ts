import type { DashboardTransactionsCacheEntry } from './types';

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
 * Build a Map of account ID to account name from a dashboard cache entry.
 */
export function buildAccountsMap(entry: DashboardTransactionsCacheEntry | undefined): Map<string, string> {
  if (!entry) {
    return new Map();
  }

  return new Map(entry.accounts.map((account) => [account.id, account.name] as const));
}
