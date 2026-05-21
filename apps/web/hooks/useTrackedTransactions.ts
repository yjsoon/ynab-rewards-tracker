"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { YnabClient } from "@/lib/ynab-client";
import { storage } from "@/lib/storage";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import type { CreditCard, CachedTransaction } from "@/lib/storage";
import type { Transaction } from "@/types/transaction";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BACKGROUND_REFRESH_MIN_AGE_MS = 60 * 1000; // Skip immediate revalidation for very recent data
const CACHE_SCOPE_TRACKED_ACCOUNT_IDS: string[] = [];

interface TrackedTransactionsSnapshot {
  fetchedAt: string;
  accounts: Array<{ id: string; name: string }>;
  transactions: Transaction[];
}

const trackedTransactionsMemoryCache = new Map<
  string,
  TrackedTransactionsSnapshot
>();
const trackedTransactionsInflightRequests = new Map<
  string,
  Promise<TrackedTransactionsSnapshot>
>();

function makeTrackedTransactionsSnapshotKey(
  pat: string,
  budgetId: string,
  sinceDate: string,
): string {
  return [pat, budgetId, sinceDate].join("::");
}

function makeTrackedAccountsScopeKey(trackedAccountIds: string[]): string {
  return [...trackedAccountIds].sort().join(",");
}

function getSnapshotAgeMs(fetchedAt: string): number {
  const parsed = new Date(fetchedAt).getTime();
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Date.now() - parsed);
}

/**
 * Type guard that validates cached transactions and safely converts them to full Transaction objects.
 * Fills in missing optional fields (memo, subtransactions) that aren't stored in cache.
 */
function isCachedTransactionArray(data: unknown): data is CachedTransaction[] {
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every((item) => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.date === "string" &&
      typeof item.amount === "number" &&
      typeof item.account_id === "string"
    );
  });
}

/**
 * Safely converts cached transactions to full Transaction objects by adding missing optional fields.
 */
function cachedToTransaction(cached: CachedTransaction): Transaction {
  return {
    ...cached,
    memo: undefined,
    subtransactions: undefined,
  };
}

function getCachedTrackedTransactionsSnapshot(
  pat: string,
  budgetId: string,
  sinceDate: string,
  trackedAccountIds: string[],
): TrackedTransactionsSnapshot | null {
  const snapshotKey = makeTrackedTransactionsSnapshotKey(
    pat,
    budgetId,
    sinceDate,
  );
  const cachedSnapshot = trackedTransactionsMemoryCache.get(snapshotKey);

  if (
    cachedSnapshot &&
    getSnapshotAgeMs(cachedSnapshot.fetchedAt) <= CACHE_TTL_MS
  ) {
    return cachedSnapshot;
  }

  storage.pruneDashboardTransactionsCache(CACHE_TTL_MS);

  const storedSnapshot =
    storage.getDashboardTransactionsCache(
      budgetId,
      sinceDate,
      CACHE_SCOPE_TRACKED_ACCOUNT_IDS,
      CACHE_TTL_MS,
    ) ??
    storage.getDashboardTransactionsCache(
      budgetId,
      sinceDate,
      trackedAccountIds,
      CACHE_TTL_MS,
    );

  if (
    !storedSnapshot ||
    !isCachedTransactionArray(storedSnapshot.transactions)
  ) {
    return null;
  }

  const snapshot: TrackedTransactionsSnapshot = {
    fetchedAt: storedSnapshot.fetchedAt,
    accounts: storedSnapshot.accounts,
    transactions: storedSnapshot.transactions.map(cachedToTransaction),
  };

  trackedTransactionsMemoryCache.set(snapshotKey, snapshot);
  return snapshot;
}

async function fetchTrackedTransactionsSnapshot(
  pat: string,
  budgetId: string,
  sinceDate: string,
  options?: {
    bypassCache?: boolean;
  },
): Promise<TrackedTransactionsSnapshot> {
  const bypassCache = options?.bypassCache === true;
  const snapshotKey = makeTrackedTransactionsSnapshotKey(
    pat,
    budgetId,
    sinceDate,
  );
  const existingRequest = trackedTransactionsInflightRequests.get(snapshotKey);
  if (!bypassCache && existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const client = new YnabClient(pat);
    const [accounts, transactions] = await Promise.all([
      client.getAccounts<{ id: string; name: string }>(budgetId, {
        bypassCache,
      }),
      client.getTransactions(budgetId, {
        since_date: sinceDate,
        bypassCache,
      }),
    ]);

    const snapshot: TrackedTransactionsSnapshot = {
      fetchedAt: new Date().toISOString(),
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
      })),
      transactions,
    };

    trackedTransactionsMemoryCache.set(snapshotKey, snapshot);
    storage.setDashboardTransactionsCache({
      budgetId,
      sinceDate,
      fetchedAt: snapshot.fetchedAt,
      trackedAccountIds: CACHE_SCOPE_TRACKED_ACCOUNT_IDS,
      transactions,
      accounts: snapshot.accounts,
    });

    return snapshot;
  })();

  trackedTransactionsInflightRequests.set(snapshotKey, request);

  try {
    return await request;
  } finally {
    if (trackedTransactionsInflightRequests.get(snapshotKey) === request) {
      trackedTransactionsInflightRequests.delete(snapshotKey);
    }
  }
}

interface UseTrackedTransactionsArgs {
  enabled?: boolean;
  pat?: string;
  selectedBudgetId?: string;
  trackedAccountIds: string[];
  featuredCards: CreditCard[];
  lookbackDays: number;
  recentLimit?: number;
  referenceDate?: Date;
}

interface UseTrackedTransactionsResult {
  recentTransactions: Transaction[];
  allTransactions: Transaction[];
  accountsMap: Map<string, string>;
  loading: boolean;
  error: string;
  refresh(): void;
  hasCachedData: boolean;
  lastUpdatedAt: string | null;
  refreshing: boolean;
}

/**
 * Fetches YNAB transactions for the selected budget and provides filtered subsets
 * tailored for tracked accounts and lookback windows.
 *
 * Transactions are retrieved once per budget/lookback window combination and cached
 * locally via `allTransactions`. `recentTransactions` is derived client-side so that
 * changes to the account filters, lookback window, or list size do not trigger
 * redundant network requests. Consumers can call `refresh()` to manually refetch,
 * while route-to-route mounts reuse a short-lived in-memory and localStorage snapshot
 * before revalidating older data in the background.
 */
export function useTrackedTransactions({
  enabled = true,
  pat,
  selectedBudgetId,
  trackedAccountIds,
  featuredCards,
  lookbackDays,
  recentLimit,
  referenceDate,
}: UseTrackedTransactionsArgs): UseTrackedTransactionsResult {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasCachedData, setHasCachedData] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const lastFetchKeyRef = useRef("");
  const requestIdRef = useRef(0);
  const trackedAccountsScopeKey = useMemo(
    () => makeTrackedAccountsScopeKey(trackedAccountIds),
    [trackedAccountIds],
  );

  const earliestTrackedWindow = useMemo(() => {
    const anchorDate = referenceDate ?? new Date();

    if (featuredCards.length === 0) {
      const fallback = new Date(anchorDate);
      fallback.setDate(fallback.getDate() - lookbackDays);
      return fallback.toISOString().split("T")[0];
    }

    const earliestMillis = featuredCards
      .map((card) => SimpleRewardsCalculator.calculatePeriod(card, anchorDate))
      .map((period) => new Date(period.start).getTime())
      .reduce(
        (min, current) => Math.min(min, current),
        Number.POSITIVE_INFINITY,
      );

    return new Date(earliestMillis).toISOString().split("T")[0];
  }, [featuredCards, lookbackDays, referenceDate]);

  const applySnapshot = useCallback((snapshot: TrackedTransactionsSnapshot) => {
    const accountNameMap = new Map<string, string>();
    snapshot.accounts.forEach((account) => {
      accountNameMap.set(account.id, account.name);
    });

    setAccountsMap(accountNameMap);
    setAllTransactions(snapshot.transactions);
    setHasCachedData(true);
    setLastUpdatedAt(snapshot.fetchedAt);
  }, []);

  const loadTransactions = useCallback(
    async (options?: { bypassCache?: boolean }) => {
      const bypassCache = options?.bypassCache === true;
      if (!enabled || !pat || !selectedBudgetId) {
        requestIdRef.current += 1;
        setAllTransactions([]);
        setAccountsMap(new Map());
        setError("");
        setHasCachedData(false);
        setLastUpdatedAt(null);
        return;
      }

      setLoading(true);
      setError("");
      const requestId = ++requestIdRef.current;

      try {
        const snapshot = await fetchTrackedTransactionsSnapshot(
          pat,
          selectedBudgetId,
          earliestTrackedWindow,
          { bypassCache },
        );

        if (requestIdRef.current !== requestId) {
          return;
        }

        applySnapshot(snapshot);
      } catch (err) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to load transactions: ${message}`);
        lastFetchKeyRef.current = "";
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [applySnapshot, enabled, pat, selectedBudgetId, earliestTrackedWindow],
  );

  useEffect(() => {
    if (!enabled || !pat || !selectedBudgetId) {
      requestIdRef.current += 1;
      lastFetchKeyRef.current = "";
      setAllTransactions([]);
      setAccountsMap(new Map());
      setHasCachedData(false);
      setLastUpdatedAt(null);
      return;
    }

    const fetchKey = [
      pat,
      selectedBudgetId,
      earliestTrackedWindow,
      trackedAccountsScopeKey,
    ].join("::");

    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }

    lastFetchKeyRef.current = fetchKey;

    // Attempt to hydrate from cache
    const cached = getCachedTrackedTransactionsSnapshot(
      pat,
      selectedBudgetId,
      earliestTrackedWindow,
      trackedAccountIds,
    );

    if (cached) {
      applySnapshot(cached);
      setError("");
      setLoading(false);

      if (getSnapshotAgeMs(cached.fetchedAt) >= BACKGROUND_REFRESH_MIN_AGE_MS) {
        void loadTransactions();
      }
    } else {
      // No cache - proceed with network fetch
      setHasCachedData(false);
      setLastUpdatedAt(null);
      void loadTransactions();
    }
  }, [
    enabled,
    pat,
    selectedBudgetId,
    earliestTrackedWindow,
    trackedAccountIds,
    trackedAccountsScopeKey,
    applySnapshot,
    loadTransactions,
  ]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const recentTransactions = useMemo(() => {
    if (!enabled || !pat || !selectedBudgetId) {
      return [];
    }

    const sortedTransactions = [...allTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const cutoff =
      lookbackDays > 0
        ? (() => {
            const date = new Date();
            date.setDate(date.getDate() - lookbackDays);
            return date;
          })()
        : null;

    let filtered = sortedTransactions;

    if (trackedAccountIds.length > 0) {
      const trackedAccountIdsSet = new Set(trackedAccountIds);
      filtered = filtered.filter((transaction) =>
        trackedAccountIdsSet.has(transaction.account_id),
      );
    }

    if (cutoff) {
      filtered = filtered.filter(
        (transaction) => new Date(transaction.date) >= cutoff,
      );
    }

    if (typeof recentLimit === "number" && recentLimit > 0) {
      filtered = filtered.slice(0, recentLimit);
    }

    return filtered;
  }, [
    allTransactions,
    enabled,
    pat,
    selectedBudgetId,
    trackedAccountIds,
    lookbackDays,
    recentLimit,
  ]);

  const refresh = useCallback(() => {
    lastFetchKeyRef.current = "";
    void loadTransactions({ bypassCache: true });
  }, [loadTransactions]);

  const refreshing = loading && hasCachedData;

  return {
    recentTransactions,
    allTransactions,
    accountsMap,
    loading,
    error,
    refresh,
    hasCachedData,
    lastUpdatedAt,
    refreshing,
  };
}
