'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  TrendingUp,
  Calendar,
  DollarSign
} from 'lucide-react';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';
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
      rewardEarned: calculation.rewardEarned,
      rewardEarnedDollars: calculation.rewardEarnedDollars,
      minimumSpend: calculation.minimumSpend,
      minimumSpendMet: calculation.minimumSpendMet,
      minimumSpendProgress: calculation.minimumSpendProgress
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

  const { totalSpend, rewardEarned, rewardEarnedDollars, minimumSpend, minimumSpendMet, minimumSpendProgress } = spendingAnalysis;

  return (
    <div className="space-y-6">
      {/* Main Status Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Current Period Status</CardTitle>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Total Spent
              </div>
              <p className="text-2xl font-bold">{formatDollars(totalSpend)}</p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                {card.type === 'cashback' ? 'Cashback Earned' : 'Miles Earned'}
              </div>
              <p className="text-2xl font-bold">
                {!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0
                  ? 'No rewards yet'
                  : card.type === 'cashback'
                  ? formatDollars(rewardEarned)
                  : `${Math.round(rewardEarned).toLocaleString()} miles`}
              </p>
              {!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Minimum not met</p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Reward Value
              </div>
              <p className="text-2xl font-bold">
                {!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0
                  ? formatDollars(0)
                  : formatDollars(rewardEarnedDollars)}
              </p>
              {card.type === 'miles' && minimumSpendMet && (
                <p className="text-xs text-muted-foreground mt-1">
                  @ ${settings?.milesValuation || 0.01}/mile
                </p>
              )}
              {!minimumSpendMet && minimumSpend !== null && minimumSpend !== undefined && minimumSpend > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Minimum not met</p>
              )}
            </div>
          </div>

          {/* Earning Block Info */}
          {card.earningBlockSize && card.earningBlockSize > 0 && spendingAnalysis.eligibleSpend !== undefined && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Earning blocks: ${card.earningBlockSize} per block</p>
                  <p className="text-sm">
                    {Math.floor(spendingAnalysis.eligibleSpend / card.earningBlockSize)} complete blocks earned from ${spendingAnalysis.eligibleSpend.toFixed(2)} eligible spend
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ${(spendingAnalysis.eligibleSpend % card.earningBlockSize).toFixed(2)} unearned remainder
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Minimum Spend Progress */}
          {minimumSpend === null || minimumSpend === undefined ? (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <strong>Minimum spend not configured.</strong> Set this in card settings to track signup bonuses and minimum spend requirements.
              </AlertDescription>
            </Alert>
          ) : minimumSpend > 0 && !minimumSpendMet ? (
            <Alert className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <AlertDescription className="text-orange-700 dark:text-orange-300">
                <strong>Minimum spend requirement not met.</strong> You need to spend {formatDollars((minimumSpend || 0) - totalSpend)} more to earn rewards this period ({minimumSpendProgress?.toFixed(1)}% complete).
              </AlertDescription>
            </Alert>
          ) : minimumSpend > 0 && minimumSpendMet ? (
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
              <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                <strong>Minimum spend requirement met!</strong> You've spent {formatDollars(totalSpend)} out of the required {formatDollars(minimumSpend)} this period.
              </AlertDescription>
            </Alert>
          ) : null}

          {/* No earning rate warning */}
          {!card.earningRate && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No earning rate configured. Set your card's earning rate in Settings to track rewards.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
