'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreditCard } from '@/lib/storage';
import { YnabClient } from '@/lib/ynab-client';
import { toIsoDateString } from '@/lib/date';
import type { Transaction } from '@/types/transaction';
import { useSelectedBudget, useYnabPAT } from './useLocalStorage';

interface UseCardTransactionsOptions {
  enabled?: boolean;
  lookbackDays?: number;
  sinceDate?: string;
}

export interface ConnectionState {
  hasPat: boolean;
  hasBudget: boolean;
}

interface UseCardTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string;
  hasLoadedCurrentRequest: boolean;
  refresh: () => Promise<void>;
  connection: ConnectionState;
}

const DEFAULT_LOOKBACK_DAYS = 90;

interface TransactionsSnapshot {
  key: string | null;
  transactions: Transaction[];
  loaded: boolean;
}

export function useCardTransactions(
  card: CreditCard | null,
  options: UseCardTransactionsOptions = {}
): UseCardTransactionsResult {
  const { enabled = true, lookbackDays = DEFAULT_LOOKBACK_DAYS, sinceDate } = options;
  const { pat } = useYnabPAT();
  const { selectedBudget, isLoading: budgetLoading } = useSelectedBudget();

  const [snapshot, setSnapshot] = useState<TransactionsSnapshot>({
    key: null,
    transactions: [],
    loaded: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const requestKey = enabled && card && selectedBudget.id
    ? [
        selectedBudget.id,
        card.ynabAccountId,
        sinceDate ?? `lookback:${lookbackDays}`,
      ].join(':')
    : null;

  const fetchTransactions = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!enabled || !card) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setSnapshot({ key: null, transactions: [], loaded: false });
      setError('');
      setLoading(false);
      return;
    }

    if (budgetLoading) {
      return;
    }

    if (!pat) {
      setSnapshot({ key: null, transactions: [], loaded: false });
      setError('YNAB access token missing. Please configure the integration.');
      setLoading(false);
      return;
    }

    if (!selectedBudget.id) {
      setSnapshot({ key: null, transactions: [], loaded: false });
      setError('No budget selected. Please configure your YNAB connection.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const client = new YnabClient(pat);

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

      const allTransactions = await client.getTransactions(selectedBudget.id, {
        since_date: sinceDate ?? toIsoDateString(lookbackDate),
        signal: controller.signal,
      });

      const cardTransactions = allTransactions
        .filter((txn: Transaction) => txn.account_id === card.ynabAccountId)
        .sort(
          (a: Transaction, b: Transaction) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

      if (requestId === requestIdRef.current) {
        setSnapshot({
          key: requestKey,
          transactions: cardTransactions,
          loaded: true,
        });
      }
    } catch (err: unknown) {
      const isAbortError =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');

      if (isAbortError) {
        return;
      }

      if (requestId === requestIdRef.current) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setSnapshot((current) => current.key === requestKey && current.loaded
          ? current
          : { key: requestKey, transactions: [], loaded: false });
        setError(`Failed to load transactions: ${errorMessage}`);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [
    enabled,
    card,
    pat,
    lookbackDays,
    sinceDate,
    selectedBudget.id,
    budgetLoading,
    requestKey,
  ]);

  useEffect(() => {
    fetchTransactions();

    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, [fetchTransactions]);

  const refresh = useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  const connection: ConnectionState = {
    hasPat: Boolean(pat),
    hasBudget: Boolean(selectedBudget.id),
  };
  const canFetchCurrentRequest = Boolean(
    enabled && card && pat && selectedBudget.id && !budgetLoading && requestKey,
  );
  const transactions = canFetchCurrentRequest && snapshot.key === requestKey
    ? snapshot.transactions
    : [];
  const hasLoadedCurrentRequest = Boolean(
    canFetchCurrentRequest && snapshot.key === requestKey && snapshot.loaded,
  );
  const waitingForCurrentRequest = canFetchCurrentRequest && snapshot.key !== requestKey;

  return {
    transactions,
    loading: loading || waitingForCurrentRequest,
    error,
    hasLoadedCurrentRequest,
    refresh,
    connection,
  };
}
