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

  // Calculate spending and rewards
  const spendingAnalysis = useMemo(() => {
    // Calculate total spend (all transactions, not just categorized)
    const totalSpend = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount / 1000), 0);

    // Calculate rewards based on card earning rate
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;

    if (card.earningRate) {
      if (card.type === 'cashback') {
        // For cashback cards, earningRate is a percentage
        rewardEarned = totalSpend * (card.earningRate / 100);
        rewardEarnedDollars = rewardEarned;
      } else {
        // For miles cards, earningRate is miles per dollar (or per block)
        if (card.milesBlockSize && card.milesBlockSize > 1) {
          // Calculate based on spending blocks
          const blocks = Math.floor(totalSpend / card.milesBlockSize);
          rewardEarned = blocks * card.earningRate;
        } else {
          // Simple miles per dollar
          rewardEarned = totalSpend * card.earningRate;
        }
        // Convert miles to dollars using valuation
        const milesValuation = settings?.milesValuation || 0.01;
        rewardEarnedDollars = rewardEarned * milesValuation;
      }
    }

    return {
      totalSpend,
      rewardEarned,
      rewardEarnedDollars
    };
  }, [transactions, card, settings]);

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

  const { totalSpend, rewardEarned, rewardEarnedDollars } = spendingAnalysis;

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
                {card.type === 'cashback'
                  ? formatDollars(rewardEarned)
                  : `${Math.round(rewardEarned).toLocaleString()} miles`}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Reward Value
              </div>
              <p className="text-2xl font-bold">{formatDollars(rewardEarnedDollars)}</p>
              {card.type === 'miles' && (
                <p className="text-xs text-muted-foreground mt-1">
                  @ ${settings?.milesValuation || 0.01}/mile
                </p>
              )}
            </div>
          </div>

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
