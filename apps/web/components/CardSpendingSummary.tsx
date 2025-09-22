'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';
import { AlertCircle, TrendingUp, CheckCircle2, Percent } from 'lucide-react';
import {
  isMinimumSpendConfigured,
  hasMinimumSpendRequirement,
  getMinimumSpendStatus,
  formatMinimumSpendText
} from '@/lib/minimum-spend-helpers';
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
      eligibleSpend: calculation.eligibleSpend,
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

  const currency = settings?.currency;
  const formatCurrency = (amount: number) =>
    formatDollars(amount, currency ? { currency } : {});

  const hasMinimum = hasMinimumSpendRequirement(minimumSpend);
  const rewardTileState = !minimumSpendMet && hasMinimum ? 'warn' : minimumSpendMet ? 'success' : 'neutral';

  const rewardTileClasses = {
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    warn: 'bg-amber-300/20 text-amber-600 dark:text-amber-200',
    neutral: 'bg-muted/10 text-muted-foreground',
  }[rewardTileState];

  const rewardValue = !minimumSpendMet && hasMinimum
    ? 'No reward'
    : card.type === 'cashback'
    ? formatCurrency(rewardEarned)
    : `${Math.round(rewardEarned).toLocaleString()}`;

  const rewardLabel = !minimumSpendMet && hasMinimum
    ? 'Minimum not met'
    : card.type === 'cashback'
    ? 'Cashback'
    : 'Miles';

  const progressPercent = minimumSpendProgress || 0;
  const progressColour = !isMinimumSpendConfigured(minimumSpend)
    ? 'bg-muted'
    : minimumSpend === 0 || minimumSpendMet
    ? 'bg-emerald-500'
    : 'bg-amber-500';

  const remainingSpend = minimumSpend && minimumSpend > 0
    ? Math.max(0, minimumSpend - totalSpend)
    : 0;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Spending and Rewards Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/10 p-3 text-left">
          <p className="text-2xl font-semibold tracking-tight">{formatCurrency(totalSpend)}</p>
          <p className="text-xs text-muted-foreground uppercase">Spent this period</p>
        </div>
        <div className={`flex min-h-[68px] flex-col justify-center rounded-lg p-3 text-left transition-colors ${rewardTileClasses}`}>
          <p className={`text-xl font-semibold tracking-tight leading-tight ${rewardTileState === 'neutral' ? 'text-foreground' : ''} sm:text-2xl`}>
            {rewardValue}
          </p>
          <p className="text-[11px] uppercase opacity-90 sm:text-xs">{rewardLabel}</p>
        </div>
      </div>

      {/* Minimum Spend Status */}
      {isMinimumSpendConfigured(minimumSpend) ? (
        minimumSpend === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-md bg-emerald-500/10 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            No minimum spend required
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Minimum spend progress</span>
              <span className={minimumSpendMet ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}>
                {formatCurrency(totalSpend)} / {minimumSpend != null ? formatCurrency(minimumSpend) : formatCurrency(0)}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/20">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${progressColour}`}
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              />
            </div>
            <div className="flex min-h-[24px] items-center justify-center gap-2 text-sm font-medium">
              {minimumSpendMet ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <span className="text-emerald-600 dark:text-emerald-300">Minimum spend met!</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-200" />
                  <span className="text-amber-600 dark:text-amber-200">{formatCurrency(remainingSpend)} to go</span>
                </>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4" />
            Minimum spend not configured
          </div>
          <p className="mt-1 text-xs">
            Set this in card settings to track signup bonuses and minimum spend requirements
          </p>
        </div>
      )}

      {/* Bottom meta info */}
      <div className="mt-auto space-y-2 pt-1 text-center">
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
            Value: {formatCurrency(rewardEarnedDollars)} @ ${settings?.milesValuation || 0.01}/mile
          </p>
        )}
        {card.earningBlockSize && card.earningBlockSize > 0 && summary.eligibleSpend !== undefined && summary.eligibleSpend > 0 && (
          <div className="rounded bg-muted/50 p-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Earning blocks:</span>
              <span className="font-medium">{Math.floor(summary.eligibleSpend / card.earningBlockSize)} × ${card.earningBlockSize}</span>
            </div>
            {(summary.eligibleSpend % card.earningBlockSize) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unearned:</span>
                <span>${(summary.eligibleSpend % card.earningBlockSize).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>{new Date(period.start).toLocaleDateString()} - {new Date(period.end).toLocaleDateString()}</span>
          <span>{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left</span>
        </div>
      </div>
    </div>
  );
}
