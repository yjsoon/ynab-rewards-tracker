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

    // Calculate days remaining
    const now = new Date();
    const end = new Date(period.end);
    const diff = end.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));

    return {
      totalSpend: calculation.totalSpend,
      rewardEarned: calculation.rewardEarned,
      rewardEarnedDollars: calculation.rewardEarnedDollars,
      daysRemaining: Math.max(0, daysRemaining),
      minimumSpend: calculation.minimumSpend,
      minimumSpendMet: calculation.minimumSpendMet,
      minimumSpendProgress: calculation.minimumSpendProgress
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

  const { totalSpend, rewardEarned, rewardEarnedDollars, daysRemaining, minimumSpend, minimumSpendMet, minimumSpendProgress } = summary;

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
            {!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0
              ? 'No rewards yet'
              : card.type === 'cashback'
              ? formatDollars(rewardEarned)
              : `${Math.round(rewardEarned).toLocaleString()}`
            }
          </p>
          <p className="text-xs text-muted-foreground">
            {!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0
              ? 'Minimum not met'
              : card.type === 'cashback' ? 'Cashback' : 'Miles'
            }
          </p>
        </div>
      </div>

      {/* Minimum Spend Status */}
      {minimumSpend !== null && minimumSpend !== undefined && (
        <div className="space-y-2">
          {minimumSpend === 0 ? (
            <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-sm font-medium">No minimum spend required</p>
            </div>
          ) : minimumSpend > 0 ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Minimum spend progress</span>
                <span className={minimumSpendMet ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
                  {formatDollars(totalSpend)} / {formatDollars(minimumSpend)}
                </span>
              </div>
              <Progress
                value={minimumSpendProgress || 0}
                className="h-2"
              />
              <div className="flex items-center justify-center gap-2">
                {minimumSpendMet ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      Minimum spend met!
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {formatDollars((minimumSpend || 0) - totalSpend)} to go
                    </p>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Not Configured Warning */}
      {(minimumSpend === null || minimumSpend === undefined) && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm font-medium">
              Minimum spend not configured
            </p>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Set this in card settings to track signup bonuses and minimum spend requirements
          </p>
        </div>
      )}

      {/* Earning Rate */}
      <div className="text-center pt-2 space-y-1">
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
                    {card.earningRate} miles per dollar
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
      </div>

      {/* Period Info - dates left, days right */}
      <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
        <span>{new Date(period.start).toLocaleDateString()} - {new Date(period.end).toLocaleDateString()}</span>
        <span>{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left</span>
      </div>
    </div>
  );
}