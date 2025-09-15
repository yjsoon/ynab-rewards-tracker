'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RewardsCalculator } from '@/lib/rewards-engine';
import { TransactionMatcher } from '@/lib/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';
import { AlertCircle, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { CreditCard, RewardRule, TagMapping } from '@/lib/storage';
import type { Transaction, TransactionWithRewards } from '@/types/transaction';

interface CardSpendingSummaryProps {
  card: CreditCard;
  pat?: string;
}

export function CardSpendingSummary({ card, pat }: CardSpendingSummaryProps) {
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [mappings, setMappings] = useState<TagMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculate current period
  const period = useMemo(() => RewardsCalculator.calculatePeriod(card), [card]);

  // Load rules and mappings
  useEffect(() => {
    const storedRules = storage.getCardRules(card.id);
    const storedMappings = storage.getCardTagMappings(card.id);
    setRules(storedRules);
    setMappings(storedMappings);
  }, [card.id]);

  // Load transactions for current period
  const loadTransactions = useCallback(async () => {
    if (!pat || !card.ynabAccountId) {
      setLoading(false);
      return;
    }

    const budgetId = storage.getSelectedBudget().id;
    if (!budgetId) {
      setLoading(false);
      return;
    }

    try {
      const client = new YnabClient(pat);
      const allTxns = await client.getTransactions(budgetId, {
        since_date: period.startDate.toISOString().split('T')[0],
      });

      const cardTxns = allTxns.filter((t: Transaction) =>
        t.account_id === card.ynabAccountId &&
        new Date(t.date) <= period.endDate
      );

      const enriched = TransactionMatcher.applyTagMappings(cardTxns, mappings);
      setTransactions(enriched);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [pat, card.ynabAccountId, period, mappings]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Calculate spending and rewards
  const summary = useMemo(() => {
    const activeRules = rules.filter(r => r.active);
    const settings = storage.getSettings();

    // Calculate total spend
    const totalSpend = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount / 1000), 0);

    // Calculate rewards
    let totalRewardsDollars = 0;
    let hasMinimum = false;
    let hasMaximum = false;
    let minimumMet = true;
    let maximumExceeded = false;
    let overallMinimum: number | undefined;
    let overallMaximum: number | undefined;

    activeRules.forEach(rule => {
      const calculations = RewardsCalculator.calculateRuleRewards(
        rule,
        transactions,
        period,
        settings
      );

      totalRewardsDollars += calculations.rewardEarnedDollars;

      if (rule.minimumSpend) {
        hasMinimum = true;
        if (!overallMinimum || rule.minimumSpend < overallMinimum) {
          overallMinimum = rule.minimumSpend;
          minimumMet = totalSpend >= rule.minimumSpend;
        }
      }

      if (rule.maximumSpend) {
        hasMaximum = true;
        if (!overallMaximum || rule.maximumSpend > overallMaximum) {
          overallMaximum = rule.maximumSpend;
        }
        if (totalSpend >= rule.maximumSpend) {
          maximumExceeded = true;
        }
      }
    });

    return {
      totalSpend,
      totalRewardsDollars,
      hasMinimum,
      hasMaximum,
      minimumMet,
      maximumExceeded,
      overallMinimum,
      overallMaximum,
    };
  }, [transactions, rules, period]);

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

  const {
    totalSpend,
    totalRewardsDollars,
    hasMinimum,
    hasMaximum,
    minimumMet,
    maximumExceeded,
    overallMinimum,
    overallMaximum
  } = summary;

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
            {card.type === 'cashback' ? formatDollars(totalRewardsDollars) : `${Math.round(totalRewardsDollars / 0.01)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {card.type === 'cashback' ? 'Cashback' : 'Miles'}
          </p>
        </div>
      </div>

      {/* Minimum Spend Progress */}
      {hasMinimum && overallMinimum && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Min spend</span>
            {minimumMet ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <span className="font-medium">{formatDollars(overallMinimum - totalSpend)} left</span>
            )}
          </div>
          <Progress
            value={Math.min(100, (totalSpend / overallMinimum) * 100)}
            className="h-1.5"
          />
        </div>
      )}

      {/* Maximum Spend Warning */}
      {hasMaximum && overallMaximum && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Max spend</span>
            {maximumExceeded ? (
              <Badge variant="destructive" className="text-xs h-4 px-1">
                <AlertCircle className="h-3 w-3 mr-0.5" />
                Exceeded
              </Badge>
            ) : (
              <span className="font-medium">{Math.round((totalSpend / overallMaximum) * 100)}%</span>
            )}
          </div>
          <Progress
            value={Math.min(100, (totalSpend / overallMaximum) * 100)}
            className={`h-1.5 ${maximumExceeded ? '[&>div]:bg-red-600' : ''}`}
          />
        </div>
      )}

      {/* No rules configured */}
      {rules.length === 0 && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground">No reward rules configured</p>
        </div>
      )}
    </div>
  );
}