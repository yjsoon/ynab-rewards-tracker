'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Sparkles, AlertTriangle, Layers, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecommendationEngine, type CategoryCardInsight } from '@/lib/rewards-engine';
import { useCategoryGroups, useCreditCards, useRewardCalculations, useSettings } from '@/hooks/useLocalStorage';
import { formatDollars } from '@/lib/utils';

const statusConfig = {
  use: { label: 'Use now – ho say!', variant: 'secondary' as const },
  consider: { label: 'Consider – still warming up', variant: 'outline' as const },
  avoid: { label: 'Avoid – cap kena already', variant: 'destructive' as const },
};

export default function RecommendationsPage() {
  const { cards } = useCreditCards();
  const { calculations } = useRewardCalculations();
  const { categoryGroups } = useCategoryGroups();
  const { settings } = useSettings();

  const recommendations = useMemo(
    () => RecommendationEngine.generateCategoryRecommendations(cards, calculations, categoryGroups, settings),
    [cards, calculations, categoryGroups, settings]
  );

  const currencyCode = settings?.currency;
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-SG', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    []
  );

  const formatCurrency = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) {
      return '—';
    }
    if (Math.abs(value) < 0.0005) {
      return formatDollars(0, { currency: currencyCode });
    }
    return formatDollars(value, { currency: currencyCode });
  };

  const formatRate = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) {
      return '—';
    }
    return percentFormatter.format(value);
  };

  const formatProgress = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) {
      return '—';
    }
    return `${Math.round(value)}%`;
  };

  const formatHeadroom = (insight: CategoryCardInsight) => {
    if (insight.shouldAvoid) {
      return 'Cap smashed';
    }
    if (insight.headroomToMaximum != null) {
      return `${formatCurrency(insight.headroomToMaximum)} left`;
    }
    if (insight.cardMaximumCap) {
      return insight.cardMaximumProgress != null
        ? `${formatProgress(insight.cardMaximumProgress)} of cap`
        : `${formatCurrency(insight.cardMaximumCap)} cap`;
    }
    return 'No cap configured';
  };

  const describeMinimum = (insight: CategoryCardInsight) => {
    if (insight.minimumRemaining != null) {
      if (insight.minimumRemaining <= 0.01) {
        return 'Minimum cleared';
      }
      return `${formatCurrency(insight.minimumRemaining)} shy`;
    }
    if (insight.minimumTarget) {
      return 'Minimum tracked';
    }
    if (!insight.cardMinimumMet && settings?.currency) {
      return `${settings.currency} minimum pending`;
    }
    return 'No minimum';
  };

  const buildInsightNotes = (insight: CategoryCardInsight) => {
    const notes: string[] = [];
    if (!insight.hasData) {
      notes.push('No spend tracked yet – go test with a kopi run lah.');
    }
    if (insight.minimumRemaining != null && insight.minimumRemaining > 0.01) {
      notes.push(`${formatCurrency(insight.minimumRemaining)} more to satisfy the minimum spend.`);
    }
    if (insight.headroomToMaximum != null) {
      if (insight.headroomToMaximum <= 0.01) {
        notes.push('Cap already kena, time to swap card.');
      } else {
        notes.push(`${formatCurrency(insight.headroomToMaximum)} headroom before the cap.`);
      }
    }
    if (!notes.length && insight.status === 'use') {
      notes.push('All green lights – whack this card for the category.');
    }
    return notes;
  };

  const comparedCardCount = useMemo(() => {
    const set = new Set<string>();
    recommendations.forEach((rec) => {
      rec.insights.forEach((insight) => set.add(insight.cardId));
    });
    return set.size;
  }, [recommendations]);

  if (categoryGroups.length === 0) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Set Up Spending Categories
            </CardTitle>
            <CardDescription>
              Group your card subcategories under broader themes before we can recommend anything steady.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Head to the Rules page, bundle your subcategories, then pop back here for card suggestions ho say.
            </p>
            <Button asChild>
              <Link href="/rules">Organise in Rules</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              No Fresh Calculations Yet
            </CardTitle>
            <CardDescription>
              Run the rewards compute on your dashboard so we can crunch the numbers for each category.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Once the latest period is computed, this page will light up with card picks and cap warnings.
            </p>
            <Button variant="outline" asChild>
              <Link href="/rewards">Compute rewards</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="h-5 w-5" />
            Card Recommendations
          </div>
          <CardTitle className="text-3xl font-bold">Who to Swipe Next</CardTitle>
          <CardDescription>
            We take your grouped subcategories, tally the rewards ho say, and flag when you&apos;re close to the cap so you can optimise like a champ.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Layers className="h-3.5 w-3.5" />
            {recommendations.length} categor{recommendations.length === 1 ? 'y' : 'ies'}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {comparedCardCount} card{comparedCardCount === 1 ? '' : 's'} compared
          </Badge>
        </div>
      </header>

      <div className="mt-8 space-y-6">
        {recommendations.map((recommendation) => {
          const best = recommendation.insights[0];
          const runners = recommendation.insights.slice(1);
          const notes = best ? buildInsightNotes(best) : [];

          return (
            <Card key={recommendation.groupId} className="border-muted/80">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    {recommendation.groupName}
                    {best && (
                      <Badge variant={statusConfig[best.status].variant} className="text-xs font-semibold">
                        {statusConfig[best.status].label}
                      </Badge>
                    )}
                  </CardTitle>
                  {recommendation.groupDescription && (
                    <CardDescription>{recommendation.groupDescription}</CardDescription>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Period analysed: {recommendation.latestPeriod ?? 'No period yet'}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {best ? (
                  <div className="rounded-xl border bg-card/60 p-4 md:p-6 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">{best.cardName}</h3>
                        <p className="text-sm text-muted-foreground">
                          Reward rate {formatRate(best.rewardRate)} • Rewards {formatCurrency(best.rewardEarnedDollars)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricPill label="Reward rate" value={formatRate(best.rewardRate)} />
                      <MetricPill label="Spend tracked" value={formatCurrency(best.totalSpend)} />
                      <MetricPill label="Minimum progress" value={formatProgress(best.minimumProgress ?? best.cardMinimumProgress)} helper={describeMinimum(best)} />
                      <MetricPill label="Headroom" value={formatHeadroom(best)} />
                    </div>
                    {notes.length > 0 && (
                      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {notes.map((note, index) => (
                          <li key={index}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No cards mapped to this group yet. Add subcategories in Rules first, bro.
                  </p>
                )}

                {runners.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase text-muted-foreground">Other cards to eye</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {runners.map((insight) => {
                        const runnerNotes = buildInsightNotes(insight);
                        return (
                          <div key={insight.cardId} className="rounded-lg border bg-background/80 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{insight.cardName}</p>
                                <p className="text-xs text-muted-foreground">
                                  Reward rate {formatRate(insight.rewardRate)} • Spend {formatCurrency(insight.totalSpend)}
                                </p>
                              </div>
                              <Badge variant={statusConfig[insight.status].variant} className="text-[10px]">
                                {statusConfig[insight.status].label}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Headroom: {formatHeadroom(insight)} • Minimum: {describeMinimum(insight)}
                            </p>
                            {runnerNotes.length > 0 && (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                {runnerNotes.map((note, index) => (
                                  <li key={index}>{note}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

interface MetricPillProps {
  label: string;
  value: string;
  helper?: string;
}

function MetricPill({ label, value, helper }: MetricPillProps) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
