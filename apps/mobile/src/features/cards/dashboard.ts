import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useStorage } from '@/contexts/StorageContext';
import {
  findBestDashboardEntry,
  shouldRefreshDashboardCache,
} from '@/lib/dashboardCache';
import {
  buildRewardsDashboard,
  projectTransactions,
  type CardDashboardProjection,
  type RewardsDashboardProjection,
  type TransactionProjection,
} from '@ynab-counter/app-core/rewards-engine';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import { LatestKeyedTaskQueue } from '@ynab-counter/app-core/utils';
import type {
  CreditCard,
  DashboardTransactionsCacheEntry,
} from '@ynab-counter/app-core/storage';
import {
  getDashboardProjectionCompleteness,
  isDashboardCacheEntryComplete,
  isDashboardCacheEntryTrusted,
} from '@ynab-counter/app-core/storage';

export type DashboardSyncState = 'synced' | 'syncing' | 'attention' | 'offline';

export interface RewardsDashboardModel {
  dashboard: RewardsDashboardProjection;
  visibleCards: CardDashboardProjection[];
  attentionCards: CardDashboardProjection[];
  trackingCards: CardDashboardProjection[];
  cacheEntry?: DashboardTransactionsCacheEntry;
  transactions: TransactionProjection[];
  lastUpdatedAt?: string;
  syncState: DashboardSyncState;
  syncLabel: string;
  canSync: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

const ATTENTION_STATUSES = new Set<CardDashboardProjection['status']>([
  'unconfigured',
  'building',
  'near_cap',
  'capped',
]);

const automaticDashboardRefreshes = new LatestKeyedTaskQueue<string>();

function requestAutomaticDashboardRefresh(
  key: string,
  sync: (options: { sinceDate: string }) => Promise<void>,
  sinceDate: string,
): Promise<void> {
  return automaticDashboardRefreshes.run(key, () => sync({ sinceDate }));
}

function applyOrdering(
  cards: CardDashboardProjection[],
  order: string[] | undefined,
): CardDashboardProjection[] {
  if (!order?.length) {
    return cards;
  }

  const byId = new Map(cards.map((projection) => [projection.card.id, projection] as const));
  const seen = new Set<string>();
  const ordered: CardDashboardProjection[] = [];

  for (const id of order) {
    const match = byId.get(id);
    if (match && !seen.has(id)) {
      ordered.push(match);
      seen.add(id);
    }
  }

  for (const projection of cards) {
    if (!seen.has(projection.card.id)) {
      ordered.push(projection);
    }
  }

  return ordered;
}

export function orderCardProjections(
  cards: CardDashboardProjection[],
  allOrder?: string[],
  cashbackOrder?: string[],
  milesOrder?: string[],
): CardDashboardProjection[] {
  if (allOrder?.length) {
    return applyOrdering(cards, allOrder);
  }

  if (cashbackOrder?.length || milesOrder?.length) {
    const cashback = applyOrdering(
      cards.filter(({ card }) => card.type === 'cashback'),
      cashbackOrder,
    );
    const miles = applyOrdering(
      cards.filter(({ card }) => card.type === 'miles'),
      milesOrder,
    );
    return [...cashback, ...miles];
  }

  return cards;
}

function isHiddenAt(cardId: string, hiddenUntil: string, referenceDate: Date): boolean {
  const expiry = new Date(hiddenUntil).getTime();
  return Boolean(cardId && Number.isFinite(expiry) && expiry > referenceDate.getTime());
}

function getSyncState(params: {
  isSyncing: boolean;
  connectionStatus: string;
  connectionError?: string;
  hasCache: boolean;
  cacheMatchesSelection: boolean;
  hasConnection: boolean;
}): DashboardSyncState {
  if (params.isSyncing) {
    return 'syncing';
  }
  if (params.connectionError && params.hasCache) {
    return 'offline';
  }
  if (params.connectionStatus === 'error' && params.hasCache) {
    return 'offline';
  }
  if (!params.hasConnection || !params.hasCache || !params.cacheMatchesSelection) {
    return 'attention';
  }
  return 'synced';
}

function sameAccountSet(left: string[], right: string[]): boolean {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((id, index) => id === normalizedRight[index]);
}

export function formatFreshness(timestamp: string | undefined, now = Date.now()): string {
  if (!timestamp) {
    return 'No saved update yet';
  }

  const updatedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(updatedAt)) {
    return 'Saved update available';
  }

  const elapsedMinutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (elapsedMinutes < 1) {
    return 'Updated just now';
  }
  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Updated ${elapsedHours} hr ago`;
  }

  return `Updated ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(updatedAt))}`;
}

export function getDashboardSyncLabel(
  state: DashboardSyncState,
  timestamp: string | undefined,
): string {
  if (state === 'syncing') {
    return timestamp ? `Syncing · ${formatFreshness(timestamp)}` : 'Syncing with YNAB…';
  }
  if (state === 'offline') {
    return timestamp ? `Offline · ${formatFreshness(timestamp).toLowerCase()}` : 'Offline';
  }
  if (state === 'attention') {
    return timestamp ? `Sync needs attention · ${formatFreshness(timestamp).toLowerCase()}` : 'Sync needed';
  }
  return formatFreshness(timestamp);
}

export function useRewardsDashboard(referenceDate?: Date): RewardsDashboardModel {
  const { state, status, actions } = useStorage();
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

  useEffect(() => {
    if (referenceDate) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setCurrentTimestamp(Date.now());
      }
    });
    return () => subscription.remove();
  }, [referenceDate]);

  useEffect(() => {
    if (!referenceDate && state.metadata.lastSuccessfulSync) {
      setCurrentTimestamp(Date.now());
    }
  }, [referenceDate, state.metadata.lastSuccessfulSync]);

  const asOf = useMemo(
    () => referenceDate ?? new Date(currentTimestamp),
    [currentTimestamp, referenceDate],
  );
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
  const cachedTransactions = useMemo(
    () => cacheEntry?.transactions ?? [],
    [cacheEntry],
  );
  const cacheIsComplete = isDashboardCacheEntryComplete(cacheEntry);
  const dashboard = useMemo(
    () => buildRewardsDashboard(
      state.cards,
      cachedTransactions,
      state.settings,
      asOf,
      cacheEntry && !cacheIsComplete && cacheEntry.requiresFullRefresh !== true
        ? state.calculations
        : [],
    ),
    [
      asOf,
      cacheIsComplete,
      cacheEntry,
      cachedTransactions,
      state.calculations,
      state.cards,
      state.settings,
    ],
  );
  const transactions = useMemo(
    () => projectTransactions(
      cachedTransactions,
      state.cards,
      state.settings,
      new Map(cacheEntry?.accounts.map((account) => [account.id, account.name] as const) ?? []),
      getDashboardProjectionCompleteness(cacheEntry),
    ),
    [
      cacheEntry,
      cachedTransactions,
      state.cards,
      state.settings,
    ],
  );

  const orderedCards = useMemo(
    () => orderCardProjections(
      dashboard.cards,
      state.settings.cardOrdering?.all,
      state.settings.cardOrdering?.cashback,
      state.settings.cardOrdering?.miles,
    ),
    [dashboard.cards, state.settings.cardOrdering],
  );

  const visibleCards = useMemo(() => {
    const hidden = new Set(
      state.hiddenCards
        .filter((entry) => isHiddenAt(entry.cardId, entry.hiddenUntil, asOf))
        .map((entry) => entry.cardId),
    );
    return orderedCards.filter(({ card }) => card.featured !== false && !hidden.has(card.id));
  }, [asOf, orderedCards, state.hiddenCards]);

  const attentionCards = useMemo(
    () => visibleCards.filter((projection) => ATTENTION_STATUSES.has(projection.status)),
    [visibleCards],
  );
  const attentionIds = useMemo(
    () => new Set(attentionCards.map(({ card }) => card.id)),
    [attentionCards],
  );
  const trackingCards = useMemo(
    () => visibleCards.filter(({ card }) => !attentionIds.has(card.id)),
    [attentionIds, visibleCards],
  );

  const canSync = Boolean(
    state.pat &&
      state.selectedBudget.id &&
      state.trackedAccountIds.length > 0,
  );
  const cacheMatchesSelection = Boolean(
    cacheEntry && sameAccountSet(cacheEntry.trackedAccountIds, state.trackedAccountIds),
  );
  const syncState = getSyncState({
    isSyncing: state.isSyncing,
    connectionStatus: state.connectionStatus,
    connectionError: state.connectionError,
    hasCache: isDashboardCacheEntryTrusted(cacheEntry),
    cacheMatchesSelection,
    hasConnection: canSync,
  });
  const lastUpdatedAt = cacheEntry?.fetchedAt ?? state.metadata.lastSuccessfulSync;
  const requiredSinceDate = useMemo(
    () => getEarliestPeriodStart(state.cards, asOf),
    [asOf, state.cards],
  );
  const automaticRefreshKey = useMemo(
    () => JSON.stringify([
      state.pat,
      state.selectedBudget.id,
      [...state.trackedAccountIds].sort(),
      requiredSinceDate,
    ]),
    [requiredSinceDate, state.pat, state.selectedBudget.id, state.trackedAccountIds],
  );

  const refresh = useCallback(async () => {
    if (!canSync || state.isSyncing) {
      return;
    }
    try {
      await actions.syncBudgetsAndAccounts({
        sinceDate: requiredSinceDate,
      });
    } catch {
      // StorageContext keeps cached data visible and exposes retry state.
    }
  }, [actions, canSync, requiredSinceDate, state.isSyncing]);

  const autoRefreshAttemptRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      referenceDate ||
      !status.isHydrated ||
      !canSync ||
      state.isSyncing
    ) {
      return;
    }

    const trustedCache = cacheMatchesSelection ? cacheEntry : undefined;
    if (!shouldRefreshDashboardCache(trustedCache, requiredSinceDate, asOf)) {
      return;
    }

    const attemptKey = [
      currentTimestamp,
      trustedCache?.fetchedAt ?? 'missing',
      trustedCache?.sinceDate ?? 'missing',
      trustedCache?.requiresFullRefresh ? 'required' : 'normal',
      requiredSinceDate,
    ].join(':');
    if (autoRefreshAttemptRef.current === attemptKey) {
      return;
    }
    autoRefreshAttemptRef.current = attemptKey;
    void requestAutomaticDashboardRefresh(
      automaticRefreshKey,
      actions.syncBudgetsAndAccounts,
      requiredSinceDate,
    ).catch(() => {
      // Keep the cached dashboard visible; foregrounding again permits another attempt.
    });
  }, [
    actions,
    asOf,
    automaticRefreshKey,
    cacheEntry,
    cacheMatchesSelection,
    canSync,
    currentTimestamp,
    referenceDate,
    requiredSinceDate,
    state.isSyncing,
    status.isHydrated,
  ]);

  return {
    dashboard,
    visibleCards,
    attentionCards,
    trackingCards,
    cacheEntry,
    transactions,
    lastUpdatedAt,
    syncState,
    syncLabel: getDashboardSyncLabel(syncState, lastUpdatedAt),
    canSync,
    isRefreshing: state.isSyncing || status.isRefreshing,
    refresh,
  };
}

export function getCardAccountName(
  card: CreditCard,
  cacheEntry: DashboardTransactionsCacheEntry | undefined,
): string | undefined {
  return cacheEntry?.accounts.find((account) => account.id === card.ynabAccountId)?.name;
}
