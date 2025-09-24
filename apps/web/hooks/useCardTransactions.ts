'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreditCard } from '@/lib/storage';
import { YnabClient } from '@/lib/ynab-client';
import type { Transaction } from '@/types/transaction';
import { useSelectedBudget, useYnabPAT } from './useLocalStorage';

interface UseCardTransactionsOptions {
  lookbackDays?: number;
}

interface ConnectionState {
  hasPat: boolean;
  hasBudget: boolean;
}

interface UseCardTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  connection: ConnectionState;
}

const DEFAULT_LOOKBACK_DAYS = 90;

export function useCardTransactions(
  card: CreditCard | null,
  options: UseCardTransactionsOptions = {}
): UseCardTransactionsResult {
  const { lookbackDays = DEFAULT_LOOKBACK_DAYS } = options;
  const { pat } = useYnabPAT();
  const { selectedBudget, isLoading: budgetLoading } = useSelectedBudget();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!card) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setTransactions([]);
      setError('');
      return;
    }

    if (budgetLoading) {
      return;
    }

    if (!pat) {
      setTransactions([]);
      setError('YNAB access token missing. Please configure the integration.');
      return;
    }

    if (!selectedBudget.id) {
      setTransactions([]);
      setError('No budget selected. Please configure your YNAB connection.');
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

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - lookbackDays);

      const allTransactions = await client.getTransactions(selectedBudget.id, {
        since_date: sinceDate.toISOString().split('T')[0],
        signal: controller.signal,
      });

      const cardTransactions = allTransactions
        .filter((txn: Transaction) => txn.account_id === card.ynabAccountId)
        .sort(
          (a: Transaction, b: Transaction) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

      setTransactions(cardTransactions);
    } catch (err: unknown) {
      const isAbortError =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');

      if (isAbortError) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to load transactions: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [card, pat, lookbackDays, selectedBudget.id, budgetLoading]);

  useEffect(() => {
    fetchTransactions();

    return () => {
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

  return {
    transactions,
    loading,
    error,
    refresh,
    connection,
  };
}
