"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  useYnabPAT,
  useCreditCards,
  useRewardRules,
  useSelectedBudget,
  useTrackedAccountIds,
  useHiddenCards,
  useDashboardViewMode
} from "@/hooks/useLocalStorage";
import { YnabClient } from "@/lib/ynab-client";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { clampDaysLeft } from "@/lib/date";
import { cn, absFromMilli } from "@/lib/utils";
import type { DashboardViewMode } from "@/lib/storage";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import { CardSpendingSummary } from "@/components/CardSpendingSummary";
import { CardSummaryCompact } from "@/components/CardSummaryCompact";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  Circle,
  Wallet,
  CreditCard,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  Loader2,
  Percent,
  Settings2
} from "lucide-react";
import type { Transaction } from "@/types/transaction";

// Constants
const TRANSACTION_LOOKBACK_DAYS = 30;
const RECENT_TRANSACTIONS_LIMIT = 10;


// Helper functions
const createSettingsClickHandler =
  (cardId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `/cards/${cardId}?tab=settings&edit=1`;
  };

// Types for better type safety

interface SetupStatus {
  pat: boolean;
  budget: boolean;
  accounts: boolean;
  cards: boolean;
}

interface YnabAccountSummary {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const { rules } = useRewardRules();

  const { selectedBudget } = useSelectedBudget();
  const { trackedAccountIds } = useTrackedAccountIds();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allBudgetTransactions, setAllBudgetTransactions] = useState<
    Transaction[]
  >([]);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dashboardAbortRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef("");

  const { hiddenCards, hideCard, unhideCard, isCardHidden } = useHiddenCards();
  const {
    viewMode: storedViewMode,
    setViewMode: persistDashboardViewMode,
    isLoading: isViewModeLoading
  } = useDashboardViewMode();

  const viewMode: DashboardViewMode = isViewModeLoading ? 'summary' : storedViewMode;

  const handleViewModeChange = useCallback(
    (mode: DashboardViewMode) => {
      persistDashboardViewMode(mode);
      if (typeof window === 'undefined') {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (mode === 'summary') {
        params.set('view', 'summary');
      } else {
        params.delete('view');
      }
      const query = params.toString();
      const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    },
    [persistDashboardViewMode]
  );

  const handleHideCard = useCallback(
    (cardId: string, hiddenUntil: string) => {
      hideCard(cardId, hiddenUntil);
    },
    [hideCard]
  );

  const handleUnhideCard = useCallback(
    (cardId: string) => {
      unhideCard(cardId);
    },
    [unhideCard]
  );

  const handleUnhideAll = useCallback(() => {
    hiddenCards.forEach((entry) => handleUnhideCard(entry.cardId));
  }, [hiddenCards, handleUnhideCard]);

  const featuredCards = useMemo(
    () => cards.filter((card) => card.featured ?? true),
    [cards]
  );

  const visibleFeaturedCards = useMemo(
    () => featuredCards.filter((card) => !isCardHidden(card.id)),
    [featuredCards, isCardHidden]
  );

  const earliestTrackedWindow = useMemo(() => {
    if (featuredCards.length === 0) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() - TRANSACTION_LOOKBACK_DAYS);
      return fallback.toISOString().split("T")[0];
    }

    const earliestMillis = featuredCards
      .map((card) => SimpleRewardsCalculator.calculatePeriod(card))
      .map((period) => new Date(period.start).getTime())
      .reduce(
        (min, current) => Math.min(min, current),
        Number.POSITIVE_INFINITY
      );

    return new Date(earliestMillis).toISOString().split("T")[0];
  }, [featuredCards]);

  const loadRecentTransactions = useCallback(
    async (budgetId: string, accountFilter: string[]) => {
      if (!pat) return;

      setLoading(true);
      setError("");

      if (dashboardAbortRef.current) {
        dashboardAbortRef.current.abort();
      }
      const controller = new AbortController();
      dashboardAbortRef.current = controller;

      try {
        const client = new YnabClient(pat);

        const accounts = await client.getAccounts<YnabAccountSummary>(
          budgetId,
          { signal: controller.signal }
        );
        const accMap = new Map<string, string>();
        accounts.forEach((acc) => {
          accMap.set(acc.id, acc.name);
        });
        setAccountsMap(accMap);

        const txns = await client.getTransactions(budgetId, {
          since_date: earliestTrackedWindow,
          signal: controller.signal
        });

        setAllBudgetTransactions(txns);

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - TRANSACTION_LOOKBACK_DAYS);
        const recent = txns
          .filter(
            (t: Transaction) =>
              accountFilter.length === 0 || accountFilter.includes(t.account_id)
          )
          .filter((t: Transaction) => new Date(t.date) >= cutoff)
          .sort(
            (a: Transaction, b: Transaction) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
          )
          .slice(0, RECENT_TRANSACTIONS_LIMIT);
        setTransactions(recent);
      } catch (err) {
        if (!(err instanceof Error) || err.name !== "AbortError") {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Failed to load transactions: ${errorMessage}`);
          lastFetchKeyRef.current = "";
        }
      } finally {
        if (dashboardAbortRef.current === controller) {
          setLoading(false);
          dashboardAbortRef.current = null;
        }
      }
    },
    [pat, earliestTrackedWindow]
  );

  useEffect(() => {
    if (!pat || !selectedBudget.id) {
      lastFetchKeyRef.current = "";
      return;
    }

    const sortedAccountsKey = [...trackedAccountIds].sort().join("|");
    const fetchKey = [
      pat,
      selectedBudget.id,
      sortedAccountsKey,
      earliestTrackedWindow
    ].join("::");

    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }

    lastFetchKeyRef.current = fetchKey;
    loadRecentTransactions(selectedBudget.id, trackedAccountIds);
  }, [
    pat,
    selectedBudget.id,
    trackedAccountIds,
    earliestTrackedWindow,
    loadRecentTransactions
  ]);

  useEffect(() => {
    return () => {
      dashboardAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('view');
    if (mode === 'summary' || mode === 'detailed') {
      persistDashboardViewMode(mode);
    }
  }, [persistDashboardViewMode]);

  // Calculate some basic stats with memoization
  const setupStatus = useMemo<SetupStatus>(
    () => ({
      pat: !!pat,
      budget: !!selectedBudget.id,
      accounts: trackedAccountIds.length > 0,
      cards: cards.length > 0
    }),
    [pat, selectedBudget.id, trackedAccountIds.length, cards.length]
  );

  const isFullyConfigured = useMemo(
    () => setupStatus.pat && setupStatus.budget && setupStatus.accounts,
    [setupStatus]
  );

  const hasUnsetMinimumSpend = useMemo(
    () =>
      cards.some(
        (card) => card.minimumSpend === null || card.minimumSpend === undefined
      ),
    [cards]
  );

  const setupProgress = useMemo(
    () => Object.values(setupStatus).filter(Boolean).length,
    [setupStatus]
  );

  const setupPercentage = useMemo(
    () => (setupProgress / 4) * 100,
    [setupProgress]
  );

  // Group and sort cards
  const { cashbackCards, milesCards } = useMemo(() => {
    const now = new Date();

    const getDaysRemaining = (card: (typeof cards)[0]) => {
      const period = SimpleRewardsCalculator.calculatePeriod(card);
      const periodDate = {
        startDate: new Date(period.start),
        endDate: new Date(period.end)
      };
      return clampDaysLeft(periodDate, now);
    };

    const cashback = visibleFeaturedCards.filter((c) => c.type === "cashback");
    const miles = visibleFeaturedCards.filter((c) => c.type === "miles");

    cashback.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));
    miles.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));

    return { cashbackCards: cashback, milesCards: miles };
  }, [visibleFeaturedCards]);

  // Empty state when nothing is configured
  if (!pat) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <div className="max-w-6xl w-full">
          <div className="text-center mb-12">
            <Wallet
              className="h-16 w-16 text-primary mx-auto mb-4"
              aria-hidden="true"
            />
            <h1 className="text-4xl font-bold mb-2">
              <span>YJAB</span>
              <span className="text-muted-foreground font-normal">
                : YNAB Journal of Awards & Bonuses
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Maximise your credit card rewards with intelligent tracking
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Features Section */}
            <Card className="p-8">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-xl mb-4">Features</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <CheckCircle2
                      className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-foreground">
                      Automatically calculate rewards based on your actual
                      spending
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-foreground">
                      Track progress toward monthly minimum spend and caps
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-foreground">
                      Get recommendations for which card to use for each
                      purchase
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-foreground">
                      100% private — all data stays in your browser
                    </span>
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground mt-6">
                  Free to use, with your own paid YNAB subscription.
                </p>
              </CardContent>
            </Card>

            {/* Connection Section */}
            <Card className="p-8 flex flex-col justify-center border-2">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-xl mb-2">Get Started</CardTitle>
                <CardDescription className="text-base">
                  Connect your YNAB account to start tracking rewards across all
                  your cards
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">Quick Setup:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Connect with your Personal Access Token</li>
                      <li>Select your budget and accounts</li>
                      <li>Configure your reward cards</li>
                      <li>Start tracking automatically</li>
                    </ol>
                  </div>

                  <Button size="lg" asChild className="w-full">
                    <Link href="/settings">
                      <Wallet className="mr-2 h-5 w-5" aria-hidden="true" />
                      Connect YNAB Account
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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
                <span className="font-semibold">
                  Setup Progress: {setupProgress}/4 steps completed
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  aria-label="Complete setup">
                  <Link href="/settings">
                    Complete Setup{" "}
                    <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <Progress
                value={setupPercentage}
                className="mb-3"
                aria-label={`Setup progress: ${setupProgress} of 4 steps completed`}
              />
              <div className="flex gap-4 flex-wrap text-sm">
                <span className="flex items-center">
                  {setupStatus.pat ? (
                    <CheckCircle2
                      className="h-4 w-4 text-green-500 mr-1"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-4 w-4 text-muted-foreground mr-1"
                      aria-hidden="true"
                    />
                  )}
                  YNAB Token
                </span>
                <span className="flex items-center">
                  {setupStatus.budget ? (
                    <CheckCircle2
                      className="h-4 w-4 text-green-500 mr-1"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-4 w-4 text-muted-foreground mr-1"
                      aria-hidden="true"
                    />
                  )}
                  Budget Selected
                </span>
                <span className="flex items-center">
                  {setupStatus.accounts ? (
                    <CheckCircle2
                      className="h-4 w-4 text-green-500 mr-1"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-4 w-4 text-muted-foreground mr-1"
                      aria-hidden="true"
                    />
                  )}
                  Accounts Tracked
                </span>
                <span className="flex items-center">
                  {setupStatus.cards ? (
                    <CheckCircle2
                      className="h-4 w-4 text-green-500 mr-1"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-4 w-4 text-muted-foreground mr-1"
                      aria-hidden="true"
                    />
                  )}
                  Cards Configured
                </span>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isFullyConfigured &&
        cards.length > 0 &&
        rules.length === 0 &&
        hasUnsetMinimumSpend && (
          <Alert className="mb-6 border-primary/20 bg-primary/5">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Nice one—your accounts are synced. Pop over to the Rules page to
                fine-tune earn rates and optimise your rewards.
              </span>
              <Button variant="outline" size="sm" asChild>
                <Link href="/rules">Go to Rules</Link>
              </Button>
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
              <CreditCard
                className="h-12 w-12 text-muted-foreground mx-auto mb-4"
                aria-hidden="true"
              />
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
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Your Cards</h2>
              {hiddenCards.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{hiddenCards.length} hidden</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnhideAll}
                  >
                    Show all
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">View</span>
              <div className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/80 p-1 shadow-inner dark:border-border/40 dark:bg-muted/40">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'summary' ? 'default' : 'ghost'}
                  className={cn(
                    'rounded-full px-3 transition-colors',
                    viewMode === 'summary'
                      ? 'shadow-sm'
                      : 'text-muted-foreground hover:text-primary-foreground hover:bg-primary/80'
                  )}
                  onClick={() => handleViewModeChange('summary')}
                >
                  Summary
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                  className={cn(
                    'rounded-full px-3 transition-colors',
                    viewMode === 'detailed'
                      ? 'shadow-sm'
                      : 'text-muted-foreground hover:text-primary-foreground hover:bg-primary/80'
                  )}
                  onClick={() => handleViewModeChange('detailed')}
                >
                  Detailed
                </Button>
              </div>
            </div>
          </div>

          {visibleFeaturedCards.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>All cards hidden</CardTitle>
                <CardDescription>
                  Hidden cards will return when their next billing cycle starts.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-muted-foreground">
                  {hiddenCards.length === 1
                    ? '1 card is currently hidden.'
                    : `${hiddenCards.length} cards are currently hidden.`}
                </p>
                <Button
                  variant="outline"
                  onClick={handleUnhideAll}
                >
                  Show hidden cards now
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Cashback Cards */}
              {cashbackCards.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Percent className="h-5 w-5 text-green-600" aria-hidden="true" />
                    <h2 className="text-xl font-semibold">Cashback Cards</h2>
                    <Badge variant="secondary">{cashbackCards.length}</Badge>
                  </div>
                  <div
                    className={cn(
                      'grid gap-4',
                      viewMode === 'detailed'
                        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    )}
                  >
                    {cashbackCards.map((card) => {
                      const accentClasses =
                        'border border-border/70 dark:border-border/50 hover:border-primary/40';

                      return (
                        <Link
                          key={card.id}
                          href={`/cards/${card.id}`}
                          className="block group"
                        >
                          <Card
                            className={cn(
                              'relative overflow-hidden flex flex-col h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg',
                              'bg-card',
                              accentClasses
                            )}
                          >
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
                              <CardTitle
                                title={card.name}
                                className={cn(
                                  viewMode === 'detailed' ? 'text-lg' : 'text-[0.95rem] sm:text-base',
                                  'pr-12 truncate'
                                )}
                              >
                                {card.name}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col">
                              {viewMode === 'detailed' ? (
                                <CardSpendingSummary
                                  card={card}
                                  pat={pat}
                                  prefetchedTransactions={allBudgetTransactions}
                                  onHideCard={handleHideCard}
                                  showHideOption
                                />
                              ) : (
                                <CardSummaryCompact
                                  card={card}
                                  pat={pat}
                                  prefetchedTransactions={allBudgetTransactions}
                                  onHideCard={handleHideCard}
                                />
                              )}
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
                  <div
                    className={cn(
                      'grid gap-4',
                      viewMode === 'detailed'
                        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    )}
                  >
                    {milesCards.map((card) => {
                      const accentClasses =
                        'border border-border/70 dark:border-border/50 hover:border-primary/40';

                      return (
                        <Link
                          key={card.id}
                          href={`/cards/${card.id}`}
                          className="block group"
                        >
                          <Card
                            className={cn(
                              'relative overflow-hidden flex flex-col h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg',
                              'bg-card',
                              accentClasses
                            )}
                          >
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
                              <CardTitle
                                title={card.name}
                                className={cn(
                                  viewMode === 'detailed' ? 'text-lg' : 'text-[0.95rem] sm:text-base',
                                  'pr-12 truncate'
                                )}
                              >
                                {card.name}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col">
                              {viewMode === 'detailed' ? (
                                <CardSpendingSummary
                                  card={card}
                                  pat={pat}
                                  prefetchedTransactions={allBudgetTransactions}
                                  onHideCard={handleHideCard}
                                  showHideOption
                                />
                              ) : (
                                <CardSummaryCompact
                                  card={card}
                                  pat={pat}
                                  prefetchedTransactions={allBudgetTransactions}
                                  onHideCard={handleHideCard}
                                />
                              )}
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
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
              {selectedBudget.name || "None Selected"}
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
            <CardTitle className="text-sm font-medium">
              Tracked Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{trackedAccountIds.length}</p>
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
            <CardTitle>
              Recent Transactions (Last {TRANSACTION_LOOKBACK_DAYS} Days)
            </CardTitle>
            <CardDescription>
              Your most recent transactions from tracked accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  className="h-8 w-8 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
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
                <table
                  className="w-full"
                  role="table"
                  aria-label="Recent transactions">
                  <thead>
                    <tr className="border-b" role="row">
                      <th className="text-left p-2 font-medium" scope="col">
                        Date
                      </th>
                      <th className="text-left p-2 font-medium" scope="col">
                        Account
                      </th>
                      <th className="text-left p-2 font-medium" scope="col">
                        Payee
                      </th>
                      <th className="text-left p-2 font-medium" scope="col">
                        Category
                      </th>
                      <th className="text-right p-2 font-medium" scope="col">
                        Amount
                      </th>
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
                        role="row">
                        <td className="p-2 text-sm">
                          {new Date(txn.date).toLocaleDateString()}
                        </td>
                        <td className="p-2 text-sm font-medium">
                          {accountsMap.get(txn.account_id) || "Unknown"}
                        </td>
                        <td className="p-2 text-sm">{txn.payee_name}</td>
                        <td className="p-2 text-sm">
                          {txn.category_name || "Uncategorised"}
                        </td>
                        <td className="p-2 text-sm text-right font-mono">
                          <CurrencyAmount value={absFromMilli(txn.amount)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !error && transactions.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">
                No recent transactions found.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
