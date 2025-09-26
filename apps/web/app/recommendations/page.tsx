'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, Layers, RefreshCw, Info, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardSpendingSummary } from '@/components/CardSpendingSummary';
import { RealTimeRecommendations, type CardOption } from '@/lib/real-time-recommendations';
import { useCategoryGroups, useCreditCards, useSettings, useYnabPAT, useSelectedBudget } from '@/hooks/useLocalStorage';
import type { Transaction } from '@/types/transaction';


export default function RecommendationsPage() {
  const { cards } = useCreditCards();
  const { categoryGroups } = useCategoryGroups();
  const { settings } = useSettings();
  const { pat } = useYnabPAT();
  const { selectedBudget } = useSelectedBudget();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [expandedNotRecommended, setExpandedNotRecommended] = useState<Record<string, boolean>>({});

  const recommendations = useMemo(() => {
    const engine = new RealTimeRecommendations(settings);
    return engine.generateRecommendations(categoryGroups, cards, transactions);
  }, [categoryGroups, cards, transactions, settings]);

  const formatPercent = useCallback((value?: number | null) => {
    if (value == null || Number.isNaN(value)) {
      return '—';
    }
    return `${(value * 100).toFixed(1)}%`;
  }, []);


  const fetchTransactions = useCallback(async () => {
    if (!pat || !selectedBudget?.id) {
      setError('Please configure YNAB connection in Settings');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      // Get current period date range
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const sinceDate = startOfMonth.toISOString().split('T')[0];

      const response = await fetch(
        `/api/ynab/budgets/${selectedBudget.id}/transactions?since_date=${sinceDate}`,
        {
          headers: {
            'Authorization': `Bearer ${pat}`,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const data = await response.json();
      const txns = data.data?.transactions || [];

      // Filter for credit card transactions
      const cardAccountIds = cards.map(c => c.ynabAccountId);
      const cardTransactions = txns.filter((t: Transaction) =>
        cardAccountIds.includes(t.account_id) && t.amount < 0 // Spending is negative
      );

      setTransactions(cardTransactions);
      setLastFetchTime(new Date());
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [pat, selectedBudget, cards]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (pat && selectedBudget?.id && cards.length > 0) {
      fetchTransactions();
    }
  }, [cards.length, fetchTransactions, pat, selectedBudget?.id]);

  const renderCardOption = (option: CardOption, isPrimary = false) => {
    // Find the actual card object
    const card = cards.find(c => c.id === option.cardId);
    if (!card) return null;

    // Check if card is maxed
    const isMaxed = option.recommendation === 'avoid';

    // Determine badge label and styling
    let badgeLabel = 'Alternative';
    let badgeClass = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30';

    if (isPrimary) {
      badgeLabel = 'Best choice';
      badgeClass = 'bg-green-500 text-white hover:bg-green-500';
    } else if (isMaxed) {
      badgeLabel = 'At limit';
      badgeClass = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800';
    } else if (option.minimumProgress < 100) {
      badgeLabel = 'Needs minimum';
      badgeClass = 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30';
    }

    const cardClass = isMaxed && !isPrimary ? 'opacity-60' : '';

    return (
      <div className={`${isPrimary ? 'rounded-xl border bg-card/60 p-4 md:p-6 shadow-sm' : 'rounded-lg border bg-background/80 p-3'} ${cardClass}`}>
        {/* Badge and Card Name Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className={isPrimary ? 'text-xl font-semibold' : 'font-medium'}>
              {card.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {option.cardType === 'cashback'
                ? `Cashback • ${formatPercent(option.effectiveRate)} reward rate`
                : `Miles • ${option.earningRate || 1} miles per dollar`}
            </p>
          </div>
          <Badge className={badgeClass}>
            {badgeLabel}
          </Badge>
        </div>

        {/* CardSpendingSummary Component */}
        <CardSpendingSummary
          card={card}
          pat={pat}
          prefetchedTransactions={transactions}
        />

        {/* Reasons (only for primary card) */}
        {option.reasons.length > 0 && isPrimary && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {option.reasons.map((reason, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {reason}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (categoryGroups.length === 0) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Set Up Spending Themes
            </CardTitle>
            <CardDescription>
              Group your card categories into themes to get personalised recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Visit Rules to create themes like Transport or Dining, then link your cards.
            </p>
            <Button asChild>
              <Link href="/rules?tab=categories">Configure Themes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Smart Recommendations</h1>
          <p className="mt-1 text-muted-foreground">
            Real-time suggestions for which card to use based on rewards and limits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTransactions}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/rules?tab=categories">Manage Themes</Link>
          </Button>
        </div>
      </header>

      {error && (
        <Alert className="mt-4" variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {lastFetchTime && (
        <div className="mt-2 text-xs text-muted-foreground">
          Last updated: {lastFetchTime.toLocaleTimeString()}
        </div>
      )}

      {!pat || !selectedBudget?.id ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Connect to YNAB
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Connect your YNAB account to see real-time spending and recommendations.
            </p>
            <Button asChild>
              <Link href="/settings">Configure Settings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-6">
          {recommendations.map((rec) => (
            <Card key={rec.themeId} className="border-muted/80">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {rec.themeName}
                  </CardTitle>
                  {rec.themeDescription && (
                    <CardDescription>{rec.themeDescription}</CardDescription>
                  )}
                </div>
                {rec.bestCard && (
                  <div className="flex items-center gap-2">
                    {rec.bestCard.recommendation === 'use' && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                    {rec.bestCard.recommendation === 'avoid' && (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {rec.bestCard ? (
                  <>
                    {renderCardOption(rec.bestCard, true)}

                    {rec.alternatives.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground">
                          Alternative options
                        </h4>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {rec.alternatives.map((alt) => (
                            <div key={alt.cardId}>
                              {renderCardOption(alt)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {rec.notRecommended && rec.notRecommended.length > 0 && (
                      <div className="space-y-3">
                        <button
                          className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground"
                          onClick={() => setExpandedNotRecommended(prev => ({
                            ...prev,
                            [rec.themeId]: !prev[rec.themeId]
                          }))}
                        >
                          {expandedNotRecommended[rec.themeId] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          Not Recommended ({rec.notRecommended.length})
                        </button>
                        {expandedNotRecommended[rec.themeId] && (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 opacity-60">
                            {rec.notRecommended.map((card) => (
                              <div key={card.cardId}>
                                {renderCardOption(card)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      {rec.noDataReason || 'No cards available for this theme'}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

