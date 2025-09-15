'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Calendar,
  AlertTriangle,
  DollarSign
} from 'lucide-react';
import { RewardsCalculator } from '@/lib/rewards-engine';
import { YnabClient } from '@/lib/ynab-client';
import { TransactionMatcher } from '@/lib/rewards-engine';
import { storage } from '@/lib/storage';
import { formatDollars } from '@/lib/utils';
import type { CreditCard, RewardRule, TagMapping, AppSettings } from '@/lib/storage';
import type { Transaction, TransactionWithRewards } from '@/types/transaction';

interface SpendingStatusProps {
  card: CreditCard;
  rules: RewardRule[];
  mappings: TagMapping[];
  pat?: string;
}

interface CategorySpending {
  category: string;
  spent: number;
  limit?: number;
  reward: number;
  percentOfLimit?: number;
  status: 'safe' | 'warning' | 'exceeded';
}

export default function SpendingStatus({ card, rules, mappings, pat }: SpendingStatusProps) {
  const [transactions, setTransactions] = useState<TransactionWithRewards[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Calculate current period
  const period = useMemo(() => RewardsCalculator.calculatePeriod(card), [card]);

  // Calculate days remaining in period
  const daysRemaining = useMemo(() => {
    const now = new Date();
    const end = period.endDate;
    const diffTime = end.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [period]);

  // Load transactions for current period
  const loadTransactions = useCallback(async () => {
    if (!pat || !card.ynabAccountId) return;

    const budgetId = storage.getSelectedBudget().id;
    if (!budgetId) return;

    setLoading(true);
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

  useEffect(() => {
    const appSettings = storage.getSettings();
    setSettings(appSettings);
  }, []);

  // Calculate spending by category and overall
  const spendingAnalysis = useMemo(() => {
    const activeRules = rules.filter(r => r.active);

    // Calculate total spend (all transactions, not just categorized)
    const totalSpend = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount / 1000), 0);

    // Calculate spending by category
    const categoryMap = new Map<string, CategorySpending>();
    let totalRewards = 0;
    let totalRewardsDollars = 0;
    let totalMiles = 0;

    // Initialize categories from rules
    activeRules.forEach(rule => {
      rule.categories.forEach(category => {
        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            category,
            spent: 0,
            reward: 0,
            status: 'safe'
          });
        }
      });
    });

    // Calculate actual spending per category
    let uncategorizedSpend = 0;
    transactions
      .filter(t => t.amount < 0)
      .forEach(t => {
        const amount = Math.abs(t.amount / 1000);

        if (t.rewardCategory) {
          const category = t.rewardCategory;
          if (!categoryMap.has(category)) {
            categoryMap.set(category, {
              category,
              spent: 0,
              reward: 0,
              status: 'safe'
            });
          }
          const catData = categoryMap.get(category)!;
          catData.spent += amount;
        } else {
          uncategorizedSpend += amount;
        }
      });

    // Apply rule limits and calculate rewards
    activeRules.forEach(rule => {
      const calculations = RewardsCalculator.calculateRuleRewards(
        rule,
        transactions,
        period,
        settings || undefined
      );

      // Accumulate total rewards
      totalRewards += calculations.rewardEarned;
      totalRewardsDollars += calculations.rewardEarnedDollars ?? 0;

      // Track miles separately for miles cards
      if (rule.rewardType === 'miles') {
        totalMiles += calculations.rewardEarned;
      }

      // Update category limits and rewards
      calculations.categoryBreakdowns.forEach(breakdown => {
        const catData = categoryMap.get(breakdown.category);
        if (catData) {
          catData.reward += breakdown.rewardDollars || breakdown.reward;

          // Check for category-specific caps
          const categoryCap = rule.categoryCaps?.find(cap => cap.category === breakdown.category);
          if (categoryCap) {
            catData.limit = categoryCap.maxSpend;
            catData.percentOfLimit = (catData.spent / categoryCap.maxSpend) * 100;

            if (catData.percentOfLimit >= 100) {
              catData.status = 'exceeded';
            } else if (catData.percentOfLimit >= 80) {
              catData.status = 'warning';
            }
          }
        }
      });
    });

    // Check overall minimum and maximum
    const rulesWithMinimum = activeRules.filter(r => r.minimumSpend);
    const rulesWithMaximum = activeRules.filter(r => r.maximumSpend);

    const overallMinimum = rulesWithMinimum.length > 0
      ? Math.min(...rulesWithMinimum.map(r => r.minimumSpend!))
      : undefined;
    const overallMaximum = rulesWithMaximum.length > 0
      ? Math.max(...rulesWithMaximum.map(r => r.maximumSpend!))
      : undefined;

    const minimumMet = !overallMinimum || totalSpend >= overallMinimum;
    const maximumExceeded = overallMaximum ? totalSpend >= overallMaximum : false;

    return {
      totalSpend,
      totalRewardsDollars,
      totalMiles,
      uncategorizedSpend,
      overallMinimum,
      overallMaximum,
      minimumMet,
      maximumExceeded,
      categories: Array.from(categoryMap.values()).sort((a, b) => {
        // Sort by status priority: exceeded > warning > safe, then by spent amount
        const statusOrder = { exceeded: 0, warning: 1, safe: 2 };
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        return statusDiff !== 0 ? statusDiff : b.spent - a.spent;
      })
    };
  }, [transactions, rules, period, settings]);

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

  const { totalSpend, totalRewardsDollars, totalMiles, uncategorizedSpend, overallMinimum, overallMaximum, minimumMet, maximumExceeded, categories } = spendingAnalysis;

  return (
    <div className="space-y-4">
      {/* Critical Alerts */}
      {maximumExceeded && (
        <Alert className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <strong>Maximum spend exceeded!</strong> You've reached the overall spending cap of {formatDollars(overallMaximum!)}.
          </AlertDescription>
        </Alert>
      )}

      {categories.some(c => c.status === 'exceeded') && !maximumExceeded && (
        <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 dark:text-orange-200">
            <strong>Category limits reached!</strong> Some categories have hit their maximum spend.
          </AlertDescription>
        </Alert>
      )}

      {/* Primary Spending Overview */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Spending Overview</CardTitle>
            <Badge variant="outline" className="text-sm">
              {daysRemaining} days left
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Minimum Spend Progress */}
          {overallMinimum && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Minimum Spend Progress</span>
                <span className="text-sm text-muted-foreground">
                  {formatDollars(totalSpend)} / {formatDollars(overallMinimum)}
                </span>
              </div>
              <Progress
                value={Math.min(100, (totalSpend / overallMinimum) * 100)}
                className="h-3"
              />
              <div className="flex items-center gap-2 mt-2">
                {minimumMet ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Minimum Met
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    {formatDollars(overallMinimum - totalSpend)} remaining
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Maximum Spend Warning */}
          {overallMaximum && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Maximum Spend Limit</span>
                <span className="text-sm text-muted-foreground">
                  {formatDollars(totalSpend)} / {formatDollars(overallMaximum)}
                </span>
              </div>
              <Progress
                value={Math.min(100, (totalSpend / overallMaximum) * 100)}
                className={`h-3 ${maximumExceeded ? '[&>div]:bg-red-600' : ''}`}
              />
              {maximumExceeded && (
                <Badge variant="destructive" className="mt-2">
                  Stop using this card
                </Badge>
              )}
            </div>
          )}

          {/* Total Spend and Rewards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center py-4">
              <div className="text-3xl font-bold">{formatDollars(totalSpend)}</div>
              <div className="text-sm text-muted-foreground mt-1">Total spend</div>
            </div>
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-green-600">
                {card.type === 'cashback'
                  ? formatDollars(totalRewardsDollars)
                  : totalMiles.toLocaleString()
                }
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {card.type === 'cashback' ? 'Rewards earned' : 'Miles earned'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Spending Breakdown */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Category Breakdown</CardTitle>
            <CardDescription>
              {categories.some(c => c.limit)
                ? 'Track spending limits and rewards by category'
                : 'Spending and rewards by category'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{cat.category}</span>
                      {cat.status === 'exceeded' && (
                        <Badge variant="destructive" className="text-xs">Exceeded</Badge>
                      )}
                      {cat.status === 'warning' && (
                        <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                          Warning
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-right">
                      <div className="font-mono">{formatDollars(cat.spent)}</div>
                      {cat.limit ? (
                        <div className="text-xs text-muted-foreground">
                          of {formatDollars(cat.limit)} max
                        </div>
                      ) : (
                        <div className="text-xs text-green-600">
                          +{formatDollars(cat.reward)} rewards
                        </div>
                      )}
                    </div>
                  </div>
                  {cat.limit && (
                    <Progress
                      value={Math.min(100, cat.percentOfLimit!)}
                      className={`h-2 ${
                        cat.status === 'exceeded' ? '[&>div]:bg-red-600' :
                        cat.status === 'warning' ? '[&>div]:bg-orange-500' : ''
                      }`}
                    />
                  )}
                </div>
              ))}
              {uncategorizedSpend > 0 && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground">Uncategorized</span>
                      <Badge variant="secondary" className="text-xs">No rewards</Badge>
                    </div>
                    <div className="text-sm text-right">
                      <div className="font-mono text-muted-foreground">{formatDollars(uncategorizedSpend)}</div>
                      <div className="text-xs text-muted-foreground">
                        Configure tag mappings
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
