'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useYnabPAT, useCreditCards } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import { clampDaysLeft } from '@/lib/date';
import { cn, absFromMilli, formatDollars } from '@/lib/utils';
import { SetupPrompt } from '@/components/SetupPrompt';
import { CardSpendingSummary } from '@/components/CardSpendingSummary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2,
  XCircle,
  Circle,
  Wallet,
  CreditCard,
  TrendingUp,
  Calendar,
  ArrowRight,
  AlertCircle,
  Loader2,
  Percent,
  Settings2
} from 'lucide-react';
import type { Transaction } from '@/types/transaction';

// Constants
const TRANSACTION_LOOKBACK_DAYS = 30;
const RECENT_TRANSACTIONS_LIMIT = 10;

// Helper functions
const createSettingsClickHandler = (cardId: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  window.location.href = `/cards/${cardId}?tab=settings&edit=1`;
};

// Types for better type safety
type SetupStep = 'pat' | 'budget' | 'accounts' | 'cards';

interface SetupStatus {
  pat: boolean;
  budget: boolean;
  accounts: boolean;
  cards: boolean;
}

export default function DashboardPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();

  const [selectedBudget, setSelectedBudget] = useState<{ id?: string; name?: string }>({});
  const [trackedAccounts, setTrackedAccounts] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allBudgetTransactions, setAllBudgetTransactions] = useState<Transaction[]>([]);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);
  const dashboardAbortRef = useRef<AbortController | null>(null);

  const loadRecentTransactions = useCallback(async (budgetId: string) => {
    if (!pat) return;

    setLoading(true);
    setError('');

    // Abort any in-flight request
    if (dashboardAbortRef.current) {
      dashboardAbortRef.current.abort();
    }
    const controller = new AbortController();
    dashboardAbortRef.current = controller;

    try {
      const client = new YnabClient(pat);
      
      // First get accounts to map IDs to names
      const accounts = await client.getAccounts(budgetId, { signal: controller.signal });
      const accMap = new Map<string, string>();
      accounts.forEach((acc: any) => accMap.set(acc.id, acc.name));
      setAccountsMap(accMap);
      
      // Compute earliest needed window across active cards (for card tiles)
      const activeCards = cards.filter(c => c.active);
      const periods = activeCards.map(c => SimpleRewardsCalculator.calculatePeriod(c));
      const earliestStart = periods.length > 0
        ? new Date(Math.min(...periods.map(p => new Date(p.start).getTime())))
        : (() => { const d = new Date(); d.setDate(d.getDate() - TRANSACTION_LOOKBACK_DAYS); return d; })();

      const txns = await client.getTransactions(budgetId, {
        since_date: earliestStart.toISOString().split('T')[0],
        signal: controller.signal,
      });

      setAllBudgetTransactions(txns);

      // Derive recent preview from budget-wide fetch (last N days)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TRANSACTION_LOOKBACK_DAYS);
      const recent = txns
        .filter((t: Transaction) => trackedAccounts.length === 0 || trackedAccounts.includes(t.account_id))
        .filter((t: Transaction) => new Date(t.date) >= cutoff)
        .sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, RECENT_TRANSACTIONS_LIMIT);
      setTransactions(recent);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load transactions: ${errorMessage}`);
      }
    } finally {
      if (dashboardAbortRef.current === controller) {
        setLoading(false);
        dashboardAbortRef.current = null;
      }
    }
  }, [pat, cards]);

  useEffect(() => {
    // Check if we should show setup prompt (only on client side)
    if (typeof window !== 'undefined') {
      const hasSeenSetup = storage.getHasSeenSetupPrompt();
      if (!pat && !hasSeenSetup) {
        setShowSetupPrompt(true);
      }
    }

    // Load saved settings
    const budget = storage.getSelectedBudget();
    setSelectedBudget(budget);
    setTrackedAccounts(storage.getTrackedAccountIds());

    // Load transactions if we have everything configured
    if (pat && budget.id) {
      loadRecentTransactions(budget.id);
    }
  }, [pat, loadRecentTransactions]);

  useEffect(() => {
    return () => {
      dashboardAbortRef.current?.abort();
    };
  }, []);

  const handleDismissSetup = () => {
    if (typeof window !== 'undefined') {
      storage.setHasSeenSetupPrompt(true);
    }
    setShowSetupPrompt(false);
  };

  // Calculate some basic stats with memoization
  const setupStatus = useMemo<SetupStatus>(() => ({
    pat: !!pat,
    budget: !!selectedBudget.id,
    accounts: trackedAccounts.length > 0,
    cards: cards.length > 0,
  }), [pat, selectedBudget.id, trackedAccounts.length, cards.length]);

  const isFullyConfigured = useMemo(() => 
    setupStatus.pat && setupStatus.budget && setupStatus.accounts,
    [setupStatus]
  );

  const setupProgress = useMemo(() => 
    Object.values(setupStatus).filter(Boolean).length,
    [setupStatus]
  );

  const setupPercentage = useMemo(() =>
    (setupProgress / 4) * 100,
    [setupProgress]
  );

  // Group and sort cards
  const { cashbackCards, milesCards } = useMemo(() => {
    const now = new Date();

    const getDaysRemaining = (card: typeof cards[0]) => {
      const period = SimpleRewardsCalculator.calculatePeriod(card);
      const periodDate = { startDate: new Date(period.start), endDate: new Date(period.end) };
      return clampDaysLeft(periodDate, now);
    };

    const cashback = cards.filter(c => c.type === 'cashback');
    const miles = cards.filter(c => c.type === 'miles');

    cashback.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));
    miles.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));

    return { cashbackCards: cashback, milesCards: miles };
  }, [cards]);

  // Empty state when nothing is configured
  if (!pat) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        {showSetupPrompt && <SetupPrompt onDismiss={handleDismissSetup} />}

        <Card className="text-center p-12">
          <div className="mb-6">
            <Wallet className="h-16 w-16 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <CardTitle className="text-2xl mb-3">No YNAB Connection</CardTitle>
            <CardDescription className="text-lg">
              Connect your YNAB account to start tracking rewards across all your cards
            </CardDescription>
          </div>
          
          <Button size="lg" asChild className="mb-8">
            <Link href="/settings">
              <Wallet className="mr-2 h-5 w-5" aria-hidden="true" />
              Connect YNAB Account
            </Link>
          </Button>
          
          <div className="max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold mb-4">Why Connect YNAB?</h3>
            <ul className="text-left space-y-2 text-muted-foreground">
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" aria-hidden="true" />
                Automatically calculate rewards based on your actual spending
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" aria-hidden="true" />
                Track progress toward quarterly and annual spending caps
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" aria-hidden="true" />
                Get recommendations for which card to use for each purchase
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" aria-hidden="true" />
                All data stays in your browser - 100% private
              </li>
            </ul>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Setup Progress */}
      {!isFullyConfigured && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            <div className="mt-2">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold">Setup Progress: {setupProgress}/4 steps completed</span>
                <Button variant="outline" size="sm" asChild aria-label="Complete setup">
                  <Link href="/settings">
                    Complete Setup <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <Progress value={setupPercentage} className="mb-3" aria-label={`Setup progress: ${setupProgress} of 4 steps completed`} />
              <div className="flex gap-4 flex-wrap text-sm">
                <span className="flex items-center">
                  {setupStatus.pat ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mr-1" aria-hidden="true" />
                  )}
                  YNAB Token
                </span>
                <span className="flex items-center">
                  {setupStatus.budget ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mr-1" aria-hidden="true" />
                  )}
                  Budget Selected
                </span>
                <span className="flex items-center">
                  {setupStatus.accounts ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mr-1" aria-hidden="true" />
                  )}
                  Accounts Tracked
                </span>
                <span className="flex items-center">
                  {setupStatus.cards ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mr-1" aria-hidden="true" />
                  )}
                  Cards Configured
                </span>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Cards Overview */}
      {cards.length === 0 ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Your Reward Cards</CardTitle>
            <CardDescription>
              Manage your credit cards and their reward rules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <p className="text-lg mb-4 text-muted-foreground">
                No cards configured yet
              </p>
              <Button asChild>
                <Link href="/settings">
                  <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add Your First Card
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8 mb-8">
          {/* Cashback Cards */}
          {cashbackCards.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Percent className="h-5 w-5 text-green-600" aria-hidden="true" />
                <h2 className="text-xl font-semibold">Cashback Cards</h2>
                <Badge variant="secondary">{cashbackCards.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cashbackCards.map((card) => {
                  const period = SimpleRewardsCalculator.calculatePeriod(card);
                  const now = new Date();
                  const periodDate = { startDate: new Date(period.start), endDate: new Date(period.end) };
                  const daysLeft = clampDaysLeft(periodDate, now);
                  const isEndingSoon = daysLeft <= 7;
                  // TODO: Get rules from storage when implementing progress tracking
                  const hasMaxSpend = false; // Placeholder for now

                  return (
                    <Link
                      key={card.id}
                      href={`/cards/${card.id}`}
                      className="block group"
                    >
                      <Card className={cn(
                        "relative overflow-hidden border-2 transition-all flex flex-col h-full cursor-pointer hover:shadow-lg",
                        isEndingSoon ? "border-orange-200 dark:border-orange-900" : "hover:border-primary/50",
                        "bg-gradient-to-br from-green-500/5 via-transparent to-green-500/10"
                      )}>
                        {/* Settings Button */}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={createSettingsClickHandler(card.id)}
                            aria-label="Go to card settings"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg pr-12">{card.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col">
                          {/* Spending Summary - Real Data */}
                          <CardSpendingSummary card={card} pat={pat} prefetchedTransactions={allBudgetTransactions} />
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Miles Cards */}
          {milesCards.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-blue-600" aria-hidden="true" />
                <h2 className="text-xl font-semibold">Miles Cards</h2>
                <Badge variant="secondary">{milesCards.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {milesCards.map((card) => {
                  const period = SimpleRewardsCalculator.calculatePeriod(card);
                  const now = new Date();
                  const periodDate = { startDate: new Date(period.start), endDate: new Date(period.end) };
                  const daysLeft = clampDaysLeft(periodDate, now);
                  const isEndingSoon = daysLeft <= 7;
                  // TODO: Get rules from storage when implementing progress tracking
                  const hasMaxSpend = false; // Placeholder for now

                  return (
                    <Link
                      key={card.id}
                      href={`/cards/${card.id}`}
                      className="block group"
                    >
                      <Card className={cn(
                        "relative overflow-hidden border-2 transition-all flex flex-col h-full cursor-pointer hover:shadow-lg",
                        isEndingSoon ? "border-orange-200 dark:border-orange-900" : "hover:border-primary/50",
                        "bg-gradient-to-br from-blue-500/5 via-transparent to-blue-500/10"
                      )}>
                        {/* Settings Button */}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={createSettingsClickHandler(card.id)}
                            aria-label="Go to card settings"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg pr-12">{card.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col">
                          {/* Spending Summary - Real Data */}
                          <CardSpendingSummary card={card} pat={pat} prefetchedTransactions={allBudgetTransactions} />
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold truncate">
              {selectedBudget.name || 'None Selected'}
            </p>
            {selectedBudget.id && (
              <Button variant="link" size="sm" asChild className="px-0">
                <Link href="/settings#settings-budget">Change</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tracked Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{trackedAccounts.length}</p>
            <Button variant="link" size="sm" asChild className="px-0">
              <Link href="/settings#settings-accounts">Manage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions Preview */}
      {isFullyConfigured && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Recent Transactions (Last {TRANSACTION_LOOKBACK_DAYS} Days)</CardTitle>
            <CardDescription>
              Your most recent transactions from tracked accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="ml-2">Loading transactions...</span>
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {!loading && !error && transactions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full" role="table" aria-label="Recent transactions">
                  <thead>
                    <tr className="border-b" role="row">
                      <th className="text-left p-2 font-medium" scope="col">Date</th>
                      <th className="text-left p-2 font-medium" scope="col">Account</th>
                      <th className="text-left p-2 font-medium" scope="col">Payee</th>
                      <th className="text-left p-2 font-medium" scope="col">Category</th>
                      <th className="text-right p-2 font-medium" scope="col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn, index) => (
                      <tr 
                        key={txn.id} 
                        className={cn(
                          "border-b",
                          index % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                        )}
                        role="row"
                      >
                        <td className="p-2 text-sm">
                          {new Date(txn.date).toLocaleDateString()}
                        </td>
                        <td className="p-2 text-sm font-medium">
                          {accountsMap.get(txn.account_id) || 'Unknown'}
                        </td>
                        <td className="p-2 text-sm">{txn.payee_name}</td>
                        <td className="p-2 text-sm">
                          {txn.category_name || 'Uncategorised'}
                        </td>
                        <td className="p-2 text-sm text-right font-mono">
                          {formatDollars(absFromMilli(txn.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !error && transactions.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">No recent transactions found.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
