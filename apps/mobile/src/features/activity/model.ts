import { useCallback, useMemo } from 'react';

import { useStorage } from '@/contexts/StorageContext';
import {
  buildAccountsMap,
  findBestDashboardEntry,
} from '@/lib/dashboardCache';
import {
  projectTransactions,
  type TransactionProjection,
} from '@ynab-counter/app-core/rewards-engine';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import type { DashboardTransactionsCacheEntry } from '@ynab-counter/app-core/storage';

const FRESH_WINDOW_MS = 30 * 60 * 1000;

export type ActivityFreshnessState = 'fresh' | 'stale' | 'syncing' | 'offline' | 'missing';

export interface ActivitySection {
  date: string;
  title: string;
  data: TransactionProjection[];
}

export interface ActivityModel {
  sections: ActivitySection[];
  transactions: TransactionProjection[];
  cacheEntry?: DashboardTransactionsCacheEntry;
  lastUpdatedAt?: string;
  freshnessState: ActivityFreshnessState;
  freshnessLabel: string;
  syncBadgeState: 'synced' | 'syncing' | 'attention' | 'offline';
  canSync: boolean;
  isHydrated: boolean;
  isRefreshing: boolean;
  hasCachedData: boolean;
  hasConnection: boolean;
  refresh: () => Promise<void>;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sectionTitle(dateValue: string, now: Date): string {
  const today = localDateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate);

  if (dateValue === today) {
    return 'Today';
  }
  if (dateValue === yesterday) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: new Date(`${dateValue}T12:00:00`).getFullYear() === now.getFullYear()
      ? undefined
      : 'numeric',
  }).format(new Date(`${dateValue}T12:00:00`));
}

export function groupActivityByDate(
  transactions: TransactionProjection[],
  now = new Date(),
): ActivitySection[] {
  const grouped = new Map<string, TransactionProjection[]>();

  for (const projection of transactions) {
    const existing = grouped.get(projection.transaction.date);
    if (existing) {
      existing.push(projection);
    } else {
      grouped.set(projection.transaction.date, [projection]);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, data]) => ({
      date,
      title: sectionTitle(date, now),
      data,
    }));
}

export function formatUpdateAge(timestamp: string | undefined, now = Date.now()): string {
  if (!timestamp) {
    return 'No saved update';
  }

  const updatedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(updatedAt)) {
    return 'Saved activity available';
  }

  const elapsedMinutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (elapsedMinutes < 1) {
    return 'updated just now';
  }
  if (elapsedMinutes < 60) {
    return `updated ${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `updated ${elapsedHours} hr ago`;
  }

  return `updated ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(updatedAt))}`;
}

function getFreshness(params: {
  timestamp?: string;
  isSyncing: boolean;
  connectionStatus: string;
  connectionError?: string;
  hasConnection: boolean;
  hasCache: boolean;
  now?: number;
}): Pick<ActivityModel, 'freshnessState' | 'freshnessLabel' | 'syncBadgeState'> {
  const now = params.now ?? Date.now();
  const updateAge = formatUpdateAge(params.timestamp, now);

  if (params.isSyncing) {
    return {
      freshnessState: 'syncing',
      freshnessLabel: params.timestamp ? `Syncing · ${updateAge}` : 'Syncing with YNAB…',
      syncBadgeState: 'syncing',
    };
  }

  if (params.hasCache && (
    params.connectionStatus === 'error' ||
    Boolean(params.connectionError) ||
    !params.hasConnection
  )) {
    return {
      freshnessState: 'offline',
      freshnessLabel: `Offline · ${updateAge}`,
      syncBadgeState: 'offline',
    };
  }

  if (!params.timestamp || !params.hasCache) {
    return {
      freshnessState: 'missing',
      freshnessLabel: 'No saved activity yet',
      syncBadgeState: 'attention',
    };
  }

  const age = now - new Date(params.timestamp).getTime();
  if (Number.isFinite(age) && age <= FRESH_WINDOW_MS) {
    return {
      freshnessState: 'fresh',
      freshnessLabel: `Fresh · ${updateAge}`,
      syncBadgeState: 'synced',
    };
  }

  return {
    freshnessState: 'stale',
    freshnessLabel: `Stale · ${updateAge}`,
    syncBadgeState: 'attention',
  };
}

function matchesQuery(projection: TransactionProjection, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('en-GB');
  if (!normalized) {
    return true;
  }

  const transaction = projection.transaction;
  return [
    transaction.payee_name,
    transaction.category_name,
    transaction.flag_name,
    transaction.flag_color,
    projection.account.name,
    projection.card?.name,
    projection.card?.issuer,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase('en-GB').includes(normalized));
}

export function useActivityModel(query = ''): ActivityModel {
  const { state, status, actions } = useStorage();
  const cacheEntry = useMemo(
    () => findBestDashboardEntry(
      state.cachedData?.dashboardTransactions,
      state.selectedBudget.id,
      state.trackedAccountIds,
    ),
    [
      state.cachedData?.dashboardTransactions,
      state.selectedBudget.id,
      state.trackedAccountIds,
    ],
  );
  const accountNames = useMemo(() => buildAccountsMap(cacheEntry), [cacheEntry]);
  const trackedAccounts = useMemo(
    () => new Set(state.trackedAccountIds),
    [state.trackedAccountIds],
  );
  const projected = useMemo(
    () => projectTransactions(
      cacheEntry?.transactions ?? [],
      state.cards,
      state.settings,
      accountNames,
    )
      .filter((projection) => (
        trackedAccounts.size === 0 || trackedAccounts.has(projection.transaction.account_id)
      ))
      .sort((left, right) => right.transaction.date.localeCompare(left.transaction.date)),
    [accountNames, cacheEntry?.transactions, state.cards, state.settings, trackedAccounts],
  );
  const transactions = useMemo(
    () => projected.filter((projection) => matchesQuery(projection, query)),
    [projected, query],
  );
  const sections = useMemo(() => groupActivityByDate(transactions), [transactions]);
  const canSync = Boolean(
    state.pat &&
      state.selectedBudget.id &&
      state.trackedAccountIds.length > 0,
  );
  const isRefreshing = state.isSyncing || status.isRefreshing;
  const lastUpdatedAt = cacheEntry?.fetchedAt ?? state.metadata.lastSuccessfulSync;
  const freshness = getFreshness({
    timestamp: lastUpdatedAt,
    isSyncing: isRefreshing,
    connectionStatus: state.connectionStatus,
    connectionError: state.connectionError,
    hasConnection: canSync,
    hasCache: Boolean(cacheEntry),
  });

  const refresh = useCallback(async () => {
    if (!canSync || state.isSyncing) {
      return;
    }

    try {
      await actions.syncBudgetsAndAccounts({
        sinceDate: getEarliestPeriodStart(state.cards),
      });
    } catch {
      // StorageContext keeps the last complete cache visible and exposes retry state.
    }
  }, [actions, canSync, state.cards, state.isSyncing]);

  return {
    sections,
    transactions,
    cacheEntry,
    lastUpdatedAt,
    ...freshness,
    canSync,
    isHydrated: status.isHydrated,
    isRefreshing,
    hasCachedData: Boolean(cacheEntry),
    hasConnection: canSync,
    refresh,
  };
}
