"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { YnabClient } from "@/lib/ynab-client";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import type { CreditCard } from "@/lib/storage";
import type { Transaction } from "@/types/transaction";

interface UseTrackedTransactionsArgs {
  pat?: string;
  selectedBudgetId?: string;
  trackedAccountIds: string[];
  featuredCards: CreditCard[];
  lookbackDays: number;
  recentLimit?: number;
}

interface UseTrackedTransactionsResult {
  recentTransactions: Transaction[];
  allTransactions: Transaction[];
  accountsMap: Map<string, string>;
  loading: boolean;
  error: string;
  refresh(): void;
}

/**
 * Fetches YNAB transactions for the selected budget and provides filtered subsets
 * tailored for tracked accounts and lookback windows.
 *
 * Transactions are retrieved once per budget/lookback window combination and cached
 * locally via `allTransactions`. `recentTransactions` is derived client-side so that
 * changes to the account filters, lookback window, or list size do not trigger
 * redundant network requests. Consumers can call `refresh()` to manually refetch,
 * and the hook aborts any in-flight request during unmount to avoid memory leaks.
 */
export function useTrackedTransactions({
  pat,
  selectedBudgetId,
  trackedAccountIds,
  featuredCards,
  lookbackDays,
  recentLimit,
}: UseTrackedTransactionsArgs): UseTrackedTransactionsResult {
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef("");

  const earliestTrackedWindow = useMemo(() => {
    if (featuredCards.length === 0) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() - lookbackDays);
      return fallback.toISOString().split("T")[0];
    }

    const earliestMillis = featuredCards
      .map((card) => SimpleRewardsCalculator.calculatePeriod(card))
      .map((period) => new Date(period.start).getTime())
      .reduce((min, current) => Math.min(min, current), Number.POSITIVE_INFINITY);

    return new Date(earliestMillis).toISOString().split("T")[0];
  }, [featuredCards, lookbackDays]);

  const loadTransactions = useCallback(async () => {
    if (!pat || !selectedBudgetId) {
      setRecentTransactions([]);
      setAllTransactions([]);
      setAccountsMap(new Map());
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const client = new YnabClient(pat);

      const accounts = await client.getAccounts<{ id: string; name: string }>(selectedBudgetId, {
        signal: controller.signal,
      });
      const accountNameMap = new Map<string, string>();
      accounts.forEach((account) => {
        accountNameMap.set(account.id, account.name);
      });
      setAccountsMap(accountNameMap);

      const transactions = await client.getTransactions(selectedBudgetId, {
        since_date: earliestTrackedWindow,
        signal: controller.signal,
      });
      setAllTransactions(transactions);
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "AbortError") {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to load transactions: ${message}`);
        lastFetchKeyRef.current = "";
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [pat, selectedBudgetId, earliestTrackedWindow]);

  useEffect(() => {
    if (!pat || !selectedBudgetId) {
      lastFetchKeyRef.current = "";
      setRecentTransactions([]);
      setAllTransactions([]);
      setAccountsMap(new Map());
      return;
    }

    const fetchKey = [pat, selectedBudgetId, earliestTrackedWindow].join("::");

    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }

    lastFetchKeyRef.current = fetchKey;
    loadTransactions();
  }, [pat, selectedBudgetId, earliestTrackedWindow, loadTransactions]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!pat || !selectedBudgetId) {
      setRecentTransactions([]);
      return;
    }

    const sortedTransactions = [...allTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const cutoff = lookbackDays > 0 ? (() => {
      const date = new Date();
      date.setDate(date.getDate() - lookbackDays);
      return date;
    })() : null;

    let filtered = sortedTransactions;

    if (trackedAccountIds.length > 0) {
      filtered = filtered.filter((transaction) => trackedAccountIds.includes(transaction.account_id));
    }

    if (cutoff) {
      filtered = filtered.filter((transaction) => new Date(transaction.date) >= cutoff);
    }

    if (typeof recentLimit === "number" && recentLimit > 0) {
      filtered = filtered.slice(0, recentLimit);
    }

    setRecentTransactions(filtered);
  }, [
    allTransactions,
    pat,
    selectedBudgetId,
    trackedAccountIds,
    lookbackDays,
    recentLimit,
  ]);

  const refresh = useCallback(() => {
    lastFetchKeyRef.current = "";
    loadTransactions();
  }, [loadTransactions]);

  return {
    recentTransactions,
    allTransactions,
    accountsMap,
    loading,
    error,
    refresh,
  };
}
