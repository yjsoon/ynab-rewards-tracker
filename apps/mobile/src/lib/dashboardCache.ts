import type { DashboardTransactionsCacheEntry } from '@ynab-counter/app-core/storage/types';

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

export function buildAccountsMap(entry: DashboardTransactionsCacheEntry | undefined): Map<string, string> {
  if (!entry) {
    return new Map();
  }

  return new Map(entry.accounts.map((account) => [account.id, account.name] as const));
}
