'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';
import { AlertCircle, TrendingUp, CheckCircle2, Percent, DollarSign } from 'lucide-react';
import type { CreditCard, AppSettings } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';

interface CardSpendingSummaryProps {
  card: CreditCard;
  pat?: string;
  // Optional: if provided, component will not fetch and will use these
  // budget-wide transactions (it will filter to this card + period).
  prefetchedTransactions?: Transaction[];
}

export function CardSpendingSummary({ card, pat, prefetchedTransactions }: CardSpendingSummaryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Calculate current period
  const period = useMemo(() => SimpleRewardsCalculator.calculatePeriod(card), [card]);

  // Load settings
  useEffect(() => {
    const appSettings = storage.getSettings();
    setSettings(appSettings);
  }, []);

  // Use prefetched budget-wide transactions if provided; otherwise fetch
  const loadTransactions = useCallback(async () => {
    // Use prefetched data path
    if (prefetchedTransactions && prefetchedTransactions.length >= 0) {
      const cardTxns = prefetchedTransactions.filter((t: Transaction) =>
        t.account_id === card.ynabAccountId &&
        t.date >= period.start &&
        t.date <= period.end
      );
      setTransactions(cardTxns);
      setLoading(false);
      return;
    }

    // Fallback: fetch for this card/period only
    if (!pat || !card.ynabAccountId) {
      setLoading(false);
      return;
    }

    const selectedBudget = storage.getSelectedBudget();
    const budgetId = selectedBudget.id;
    if (!budgetId) {
      setLoading(false);
      return;
    }

    const client = new YnabClient(pat);
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const allTxns = await client.getTransactions(budgetId, {
        since_date: period.start,
        signal: controller.signal,
      });
      const cardTxns = allTxns.filter((t: Transaction) =>
        t.account_id === card.ynabAccountId && t.date <= period.end
      );
      setTransactions(cardTxns);
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Failed to load transactions:', error);
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [prefetchedTransactions, pat, card.ynabAccountId, period]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Calculate spending and rewards using simplified system
  const summary = useMemo(() => {
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
      settings || undefined
    );

    return {
      totalSpend: calculation.totalSpend,
      rewardEarned: calculation.rewardEarned,
      rewardEarnedDollars: calculation.rewardEarnedDollars
    };
  }, [card, transactions, period, settings]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="bg-muted/5 rounded-lg p-3">
          <div className="animate-pulse">
            <div className="h-6 bg-muted rounded w-20 mx-auto mb-1"></div>
            <div className="h-3 bg-muted rounded w-24 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  const { totalSpend, rewardEarned, rewardEarnedDollars } = summary;

  return (
    <div className="space-y-3">
      {/* Spending and Rewards Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-muted/5 rounded-lg p-2 text-center">
          <p className="text-lg font-bold">{formatDollars(totalSpend)}</p>
          <p className="text-xs text-muted-foreground">Spent</p>
        </div>
        <div className="bg-green-500/10 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-green-600 dark:text-green-400">
            {card.type === 'cashback'
              ? formatDollars(rewardEarned)
              : `${Math.round(rewardEarned).toLocaleString()}`
            }
          </p>
          <p className="text-xs text-muted-foreground">
            {card.type === 'cashback' ? 'Cashback' : 'Miles'}
          </p>
        </div>
      </div>

      {/* Earning Rate and Period Info */}
      <div className="text-center pt-2 border-t space-y-1">
        <div className="flex items-center justify-center gap-2">
          {card.earningRate ? (
            <>
              {card.type === 'cashback' ? (
                <>
                  <Percent className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm font-medium">{card.earningRate}% cashback</p>
                </>
              ) : (
                <>
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {card.earningRate}x miles
                    {card.milesBlockSize && card.milesBlockSize > 1
                      ? ` per $${card.milesBlockSize}`
                      : ' per dollar'
                    }
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No earning rate configured</p>
          )}
        </div>
        {card.type === 'miles' && rewardEarnedDollars > 0 && (
          <p className="text-xs text-muted-foreground">
            Value: {formatDollars(rewardEarnedDollars)} @ ${settings?.milesValuation || 0.01}/mile
          </p>
        )}
        <div className="text-xs text-muted-foreground">
          {new Date(period.start).toLocaleDateString()} - {new Date(period.end).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}