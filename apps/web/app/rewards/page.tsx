'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useCreditCards, useRewardRules, useRewardCalculations, useSettings, useYnabPAT, useSelectedBudget } from '@/hooks/useLocalStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp,
  CreditCard,
  Target,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Zap,
  Calendar,
  Settings
} from 'lucide-react';
import { RecommendationEngine, type CardRecommendation } from '@/lib/rewards-engine';
import { computeCurrentPeriod } from '@/lib/rewards-engine/compute';
import { storage } from '@/lib/storage';
import type { RewardCalculation } from '@/lib/storage';

export default function RewardsDashboardPage() {
  const { cards } = useCreditCards();
  const { rules } = useRewardRules();
  const { calculations, saveCalculation } = useRewardCalculations();
  const { pat } = useYnabPAT();
  const { selectedBudget } = useSelectedBudget();
  const { settings } = useSettings();
  const [computing, setComputing] = useState(false);
  const [computeMessage, setComputeMessage] = useState('');
  const computeAbortRef = useRef<AbortController | null>(null);
  
  const [totalRewardsEarned, setTotalRewardsEarned] = useState(0);
  const [currentPeriodSpend, setCurrentPeriodSpend] = useState(0);
  const [alerts, setAlerts] = useState<CardRecommendation[]>([]);
  const [lastComputedAt, setLastComputedAt] = useState<string | null>(null);

  const trackedCards = cards;
  const activeRules = rules.filter(rule => rule.active);

  // Calculate summary stats
  useEffect(() => {
    const currentMonthCalcs = calculations.filter(calc => {
      // Filter to current month - simplified for now
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return calc.period.startsWith(currentMonth);
    });

    // Normalize rewards to dollars: prefer rewardEarnedDollars; fallback to raw when cashback
    const toDollars = (c: RewardCalculation) =>
      (c.rewardEarnedDollars ?? (c.rewardType === 'cashback' ? c.rewardEarned : 0));

    const totalRewards = currentMonthCalcs.reduce((sum, calc) => sum + toDollars(calc), 0);
    const totalSpend = currentMonthCalcs.reduce((sum, calc) => sum + calc.totalSpend, 0);

    setTotalRewardsEarned(totalRewards);
    setCurrentPeriodSpend(totalSpend);

    // Generate alerts
    const cardAlerts = RecommendationEngine.generateAlerts(trackedCards, currentMonthCalcs);
    setAlerts(cardAlerts);
  }, [calculations, trackedCards, rules]);

  const hasData = trackedCards.length > 0 && activeRules.length > 0;

  // Load last computed timestamp on mount
  useEffect(() => {
    const ts = storage.getLastComputedAt();
    setLastComputedAt(ts || null);
  }, []);

  const handleCompute = useCallback(async () => {
    setComputeMessage('');
    if (!pat || !selectedBudget.id) {
      setComputeMessage('Please configure your YNAB token and select a budget before computing.');
      return;
    }
    setComputing(true);
    try {
      // Abort any in-flight compute
      if (computeAbortRef.current) {
        computeAbortRef.current.abort();
      }
      const controller = new AbortController();
      computeAbortRef.current = controller;
      // Optionally clear only current-period calcs; for now, clear all to avoid duplicates
      // A smarter approach would delete by (card, rule, period) as we recompute
      // but saveCalculation will overwrite existing entries for the same key tuple.
      const calcs = await computeCurrentPeriod(
        pat,
        selectedBudget.id,
        trackedCards,
        rules,
        settings,
        controller.signal
      );
      // If we computed a period, replace all calcs for that period to avoid stale entries
      const periodName = calcs[0]?.period;
      if (periodName) {
        storage.deleteCalculationsForPeriod(periodName);
      }
      calcs.forEach(c => saveCalculation(c));
      const nowIso = new Date().toISOString();
      storage.setLastComputedAt(nowIso);
      setLastComputedAt(nowIso);
      setComputeMessage(`Computed ${calcs.length} rule(s) for the current period.`);
    } catch (err) {
      // Swallow aborts quietly
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err);
        setComputeMessage(`Computation failed: ${msg}`);
      }
    } finally {
      setComputing(false);
    }
  }, [trackedCards, rules, saveCalculation, pat, selectedBudget.id, settings]);

  useEffect(() => {
    return () => {
      // Abort on unmount
      computeAbortRef.current?.abort();
    };
  }, []);

  if (!hasData) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Rewards Dashboard</h1>
        
        <Card className="text-center py-12">
          <CardContent>
            <TrendingUp className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
            <CardTitle className="text-2xl mb-4">Set Up Your Rewards Tracking</CardTitle>
            <CardDescription className="text-lg mb-8 max-w-2xl mx-auto">
              Configure your credit cards and reward rules to start tracking your earnings and optimise your spending.
            </CardDescription>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/settings">
                  <CreditCard className="mr-2 h-5 w-5" />
                  Configure Cards
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/">
                  <Settings className="mr-2 h-5 w-5" />
                  Back to Dashboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Rewards Dashboard</h1>
        <Button onClick={handleCompute} disabled={computing || !hasData} variant="outline">
          {computing ? 'Computing…' : 'Compute Now'}
        </Button>
      </div>
      {computeMessage && (
        <Alert className="mb-6">
          <AlertDescription>{computeMessage}</AlertDescription>
        </Alert>
      )}
      {lastComputedAt && (
        <p className="text-sm text-muted-foreground mb-4">Last computed: {new Date(lastComputedAt).toLocaleString()}</p>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3 mb-8">
          {alerts.map((alert, index) => (
            <Alert 
              key={index} 
              variant={alert.priority === 'high' ? 'destructive' : 'default'}
            >
              {alert.priority === 'high' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <strong>{alert.cardName}</strong>: {alert.reason}
                {alert.action === 'avoid' && ' - Consider switching to a different card.'}
                {alert.action === 'use' && ' - Focus spending on this card.'}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rewards</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalRewardsEarned > 0 ? `$${totalRewardsEarned.toFixed(2)}` : 'Coming Soon'}
            </div>
            <p className="text-xs text-muted-foreground">Current period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentPeriodSpend > 0 ? `$${currentPeriodSpend.toLocaleString()}` : 'Coming Soon'}
            </div>
            <p className="text-xs text-muted-foreground">Across all cards</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tracked Cards</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trackedCards.length}</div>
            <p className="text-xs text-muted-foreground">{activeRules.length} reward rules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Effective Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalRewardsEarned > 0 && currentPeriodSpend > 0 
                ? `${((totalRewardsEarned / currentPeriodSpend) * 100).toFixed(1)}%`
                : 'Coming Soon'
              }
            </div>
            <p className="text-xs text-muted-foreground">Average return</p>
          </CardContent>
        </Card>
      </div>

      {/* Card Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Card Performance</CardTitle>
            <CardDescription>Current period earnings by card</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trackedCards.map(card => {
                const cardCalcs = calculations.filter(calc => calc.cardId === card.id);
                const cardRewards = cardCalcs.reduce((sum, calc) => {
                  const dollars = (calc.rewardEarnedDollars ?? (calc.rewardType === 'cashback' ? calc.rewardEarned : 0));
                  return sum + dollars;
                }, 0);
                const cardSpend = cardCalcs.reduce((sum, calc) => sum + calc.totalSpend, 0);
                const effectiveRate = cardSpend > 0 ? (cardRewards / cardSpend) * 100 : 0;

                return (
                  <div key={card.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <div>
                        <p className="font-medium">{card.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {card.type === 'cashback' ? 'Cashback' : 'Miles'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {cardRewards > 0 ? `$${cardRewards.toFixed(2)}` : 'No data'}
                      </p>
                      {effectiveRate > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {effectiveRate.toFixed(1)}% rate
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {calculations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-3" />
                <p>No transaction data yet</p>
                <p className="text-sm">Connect to YNAB to see performance</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest reward calculations and updates</CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4 mr-2" />
                Manage Cards
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {calculations.length > 0 ? (
            <div className="space-y-4">
              {calculations.slice(0, 5).map((calc, index) => {
                const card = cards.find(c => c.id === calc.cardId);
                const rule = rules.find(r => r.id === calc.ruleId);
                
                return (
                  <div key={index} className="flex items-center justify-between py-3 border-b last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline">{calc.period}</Badge>
                      <div>
                        <p className="font-medium">{card?.name || 'Unknown Card'}</p>
                        <p className="text-sm text-muted-foreground">
                          {rule?.name || 'Unknown Rule'} • ${calc.totalSpend.toFixed(2)} spent
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${(calc.rewardEarnedDollars ?? (calc.rewardType === 'cashback' ? calc.rewardEarned : 0)).toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">earned</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-3" />
              <p>No activity yet</p>
              <p className="text-sm">Start using your cards to see activity here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
