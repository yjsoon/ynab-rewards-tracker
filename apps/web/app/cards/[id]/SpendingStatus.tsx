'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SpendingProgressBar } from '@/components/SpendingProgressBar';
import {
  AlertCircle,
  TrendingUp,
  Calendar,
  DollarSign,
  XCircle,
  CheckCircle2
} from 'lucide-react';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { CurrencyAmount } from '@/components/CurrencyAmount';
import type { CreditCard, AppSettings } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';

interface SpendingStatusProps {
  card: CreditCard;
  pat?: string;
}

export default function SpendingStatus({ card, pat }: SpendingStatusProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Calculate current period
  const period = useMemo(() => SimpleRewardsCalculator.calculatePeriod(card), [card]);

  // Calculate days remaining in period
  const daysRemaining = useMemo(() => {
    const now = new Date();
    const end = new Date(period.end);
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [period]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!pat || !card.ynabAccountId) {
      return;
    }

    // Abort any previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      const ynabClient = new YnabClient(pat);
      const selectedBudget = storage.getSelectedBudget();
      const selectedBudgetId = selectedBudget.id;

      if (!selectedBudgetId) {
        setLoading(false);
        return;
      }
      const allTransactions = await ynabClient.getTransactions(
        selectedBudgetId,
        {
          since_date: period.start,
          signal: controller.signal
        }
      );

      if (Array.isArray(allTransactions)) {
        // Filter transactions for this specific account and period
        const accountTransactions = allTransactions.filter(
          (t: Transaction) =>
            t.account_id === card.ynabAccountId &&
            t.date >= period.start &&
            t.date <= period.end
        );

        setTransactions(accountTransactions);
      } else {
        setTransactions([]);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Failed to fetch transactions:', error);
        setTransactions([]);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [pat, card.ynabAccountId, period]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const appSettings = storage.getSettings();
    setSettings(appSettings);
  }, []);

  // Calculate spending and rewards using the simplified calculator
  const spendingAnalysis = useMemo(() => {
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      transactions,
      period,
      settings || undefined
    );

    return {
      totalSpend: calculation.totalSpend,
      eligibleSpend: calculation.eligibleSpend,
      eligibleSpendBeforeBlocks: calculation.eligibleSpendBeforeBlocks,
      rewardEarned: calculation.rewardEarned,
      rewardEarnedDollars: calculation.rewardEarnedDollars,
      minimumSpend: calculation.minimumSpend,
      minimumSpendMet: calculation.minimumSpendMet,
      minimumSpendProgress: calculation.minimumSpendProgress,
      maximumSpend: calculation.maximumSpend,
      maximumSpendExceeded: calculation.maximumSpendExceeded,
      maximumSpendProgress: calculation.maximumSpendProgress
    };
  }, [transactions, card, period, settings]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading spending data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { totalSpend, eligibleSpend, eligibleSpendBeforeBlocks, rewardEarned, rewardEarnedDollars, minimumSpend, minimumSpendMet, maximumSpend, maximumSpendExceeded } = spendingAnalysis;

  const currency = settings?.currency;
  const milesValuation = settings?.milesValuation ?? 0.01;
  const hasMaximum = typeof maximumSpend === 'number' && maximumSpend > 0;

  const unearnedAmount = Math.max(
    0,
    (eligibleSpendBeforeBlocks ?? eligibleSpend ?? 0) - (eligibleSpend ?? 0)
  );

  return (
    <div className="space-y-6">
      {/* Main Status Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">This Period</CardTitle>
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date(period.start).toLocaleDateString()} - {new Date(period.end).toLocaleDateString()}
                <Badge variant="secondary" className="ml-2">
                  {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Spending Summary */}
          <div className={`grid grid-cols-1 ${card.type === 'cashback' ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Total Spent
              </div>
              <p className="text-2xl font-bold">
                <CurrencyAmount value={totalSpend} currency={currency} />
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                {card.type === 'cashback' ? 'Cashback Earned' : 'Miles Earned'}
              </div>
              <p className="text-2xl font-bold">
                {(!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0)
                  ? 'No reward'
                  : card.type === 'cashback'
                  ? <CurrencyAmount value={rewardEarned} currency={currency} />
                  : `${Math.round(rewardEarned).toLocaleString()} miles`}
              </p>
              {maximumSpendExceeded ? (
                <p className="text-xs text-muted-foreground mt-1">Capped at maximum</p>
              ) : !minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Minimum not met</p>
              ) : null}
            </div>

            {/* Only show Reward Value for miles cards since it's different from miles earned */}
            {card.type === 'miles' && (
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  Dollar Value
                </div>
                <p className="text-2xl font-bold">
                  {(!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0)
                    ? <CurrencyAmount value={0} currency={currency} />
                    : <CurrencyAmount value={rewardEarnedDollars} currency={currency} />}
                </p>
                {minimumSpendMet && (
                  <p className="text-xs text-muted-foreground mt-1">
                    @{' '}
                    <CurrencyAmount value={milesValuation} currency={currency} />/mile
                  </p>
                )}
                {maximumSpendExceeded ? (
                  <p className="text-xs text-muted-foreground mt-1">Capped at maximum</p>
                ) : !minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">Minimum not met</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Earning Block Info */}
          {card.earningBlockSize && card.earningBlockSize > 0 && eligibleSpend !== undefined && eligibleSpend > 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">
                    Earning blocks:{' '}
                    <CurrencyAmount value={card.earningBlockSize} currency={currency} /> per block
                  </p>
                  <p className="text-sm">
                    {Math.floor(eligibleSpend / card.earningBlockSize)} complete blocks earned from{' '}
                    <CurrencyAmount value={eligibleSpend} currency={currency} /> eligible spend
                  </p>
                  {unearnedAmount > 0 && (
                    <p className="text-sm text-muted-foreground">
                      <CurrencyAmount value={unearnedAmount} currency={currency} /> unearned remainder
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Spending Progress Bar */}
          {(minimumSpend !== null && minimumSpend !== undefined) || hasMaximum ? (
            <div className="space-y-4">
              <div className="bg-muted/5 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Spending Progress</h3>
                <SpendingProgressBar
                  totalSpend={totalSpend}
                  minimumSpend={minimumSpend}
                  maximumSpend={maximumSpend}
                  currency={currency}
                  showLabels={true}
                  showWarnings={true}
                />
              </div>

              {/* Status Alerts */}
              {maximumSpendExceeded ? (
                <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <AlertDescription className="text-red-700 dark:text-red-300">
                    <strong>Maximum spend limit exceeded!</strong> You&apos;ve spent <CurrencyAmount value={totalSpend} currency={currency} /> which is over the <CurrencyAmount value={maximumSpend ?? 0} currency={currency} /> limit. No additional rewards will be earned on this card this period.
                  </AlertDescription>
                </Alert>
              ) : minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 && !minimumSpendMet ? (
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    <strong>Minimum spend requirement not met.</strong> You need to spend <CurrencyAmount value={(minimumSpend || 0) - totalSpend} currency={currency} /> more to start earning rewards this period.
                  </AlertDescription>
                </Alert>
              ) : minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 && minimumSpendMet ? (
                <Alert className="border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500/80 dark:text-emerald-300/80" />
                  <AlertDescription className="text-emerald-700/80 dark:text-emerald-200/90">
                    <strong className="font-semibold">You&apos;re earning rewards!</strong> {hasMaximum && !maximumSpendExceeded && `You have ${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format((maximumSpend ?? 0) - totalSpend)} left before reaching the maximum spend limit.`}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <strong>No spending limits configured.</strong> Set minimum and maximum spend amounts in card settings to track your progress and optimize rewards.
              </AlertDescription>
            </Alert>
          )}

          {/* No earning rate warning */}
          {!card.earningRate && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No earning rate configured. Set your card&apos;s earning rate in Settings to track rewards.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
