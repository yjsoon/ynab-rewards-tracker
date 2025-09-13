'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useYnabPAT, useCreditCards } from '@/hooks/useLocalStorage';
import { YnabClient } from '@/lib/ynab-client';
import { storage } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { SetupPrompt } from '@/components/SetupPrompt';
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
  Construction
} from 'lucide-react';
import type { Transaction } from '@/types/transaction';

// Constants
const TRANSACTION_LOOKBACK_DAYS = 30;
const RECENT_TRANSACTIONS_LIMIT = 10;

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
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);

  const loadRecentTransactions = useCallback(async (budgetId: string) => {
    if (!pat) return;
    
    setLoading(true);
    setError('');
    try {
      const client = new YnabClient(pat);
      
      // First get accounts to map IDs to names
      const accounts = await client.getAccounts(budgetId);
      const accMap = new Map<string, string>();
      accounts.forEach((acc: any) => accMap.set(acc.id, acc.name));
      setAccountsMap(accMap);
      
      // Get transactions from the last N days
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - TRANSACTION_LOOKBACK_DAYS);
      const txns = await client.getTransactions(budgetId, {
        since_date: sinceDate.toISOString().split('T')[0],
      });
      // Show only the most recent transactions
      setTransactions(txns.slice(0, RECENT_TRANSACTIONS_LIMIT));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to load transactions: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [pat]);

  useEffect(() => {
    // Check if we should show setup prompt (only on client side)
    if (typeof window !== 'undefined') {
      const hasSeenSetup = localStorage.getItem('hasSeenSetupPrompt');
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

  const handleDismissSetup = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasSeenSetupPrompt', 'true');
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

  // Empty state when nothing is configured
  if (!pat) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        {showSetupPrompt && <SetupPrompt onDismiss={handleDismissSetup} />}
        
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
        
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
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

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
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Your Reward Cards</CardTitle>
          <CardDescription>
            Manage your credit cards and their reward rules
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map((card) => (
                <Card 
                  key={card.id} 
                  className="group relative overflow-hidden border-2 hover:border-primary/50 transition-all bg-gradient-to-br from-primary/5 via-transparent to-primary/10 flex flex-col"
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{card.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {card.type === 'cashback' ? 'Cashback Card' : 
                           card.type === 'miles' ? 'Miles Card' : 'Reward Card'}
                        </CardDescription>
                      </div>
                      <Badge 
                        variant={card.active ? 'default' : 'secondary'} 
                        className={cn(
                          "shrink-0",
                          card.active && "bg-primary text-primary-foreground"
                        )}
                      >
                        {card.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="space-y-3 flex-1">
                      {/* Placeholder for rewards summary */}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Period:</span>
                        <span className="font-medium">Coming Soon</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Rewards Earned:</span>
                        <span className="font-medium">Coming Soon</span>
                      </div>
                    </div>
                    <div className="pt-3 mt-auto">
                      <Button variant="ghost" size="icon" asChild className="w-full hover:bg-primary/10">
                        <Link href={`/cards/${card.id}`}>
                          <ArrowRight className="h-5 w-5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                <Link href="/settings">Change</Link>
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
              <Link href="/settings">Manage</Link>
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
                          {txn.category_name || 'Uncategorized'}
                        </td>
                        <td className="p-2 text-sm text-right font-mono">
                          ${Math.abs(txn.amount / 1000).toFixed(2)}
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
