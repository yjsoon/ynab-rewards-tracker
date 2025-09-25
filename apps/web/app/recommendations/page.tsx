'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, Layers, TrendingUp, Info } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RecommendationEngine, type CategoryCardInsight } from '@/lib/rewards-engine';
import { useCategoryGroups, useCreditCards, useRewardCalculations, useSettings } from '@/hooks/useLocalStorage';
import { formatDollars } from '@/lib/utils';

const statusConfig = {
  use: { label: 'Best pick', variant: 'secondary' as const },
  consider: { label: 'Worth considering', variant: 'outline' as const },
  avoid: { label: 'Avoid for now', variant: 'destructive' as const },
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

  const summariseHeadroom = (insight: CategoryCardInsight) => {
    if (insight.shouldAvoid) {
      return {
        value: 'Cap reached',
        helper: 'Further spend will not earn additional rewards.',
      };
    }
    if (insight.headroomToMaximum != null) {
      return {
        value: `${formatCurrency(insight.headroomToMaximum)} remaining`,
        helper: 'Spend available before you hit the cap.',
      };
    }
    if (insight.cardMaximumCap) {
      if (insight.cardMaximumProgress != null) {
        return {
          value: `${formatProgress(insight.cardMaximumProgress)} of cap used`,
          helper: `${formatCurrency(insight.cardMaximumCap)} cap configured for this category.`,
        };
      }
      return {
        value: `${formatCurrency(insight.cardMaximumCap)} cap configured`,
        helper: 'No spending recorded against the cap yet.',
      };
    }
    return {
      value: 'No cap configured',
      helper: 'This category has no maximum spend limit.',
    };
  };

  const describeMinimum = (insight: CategoryCardInsight) => {
    if (insight.minimumRemaining != null) {
      if (insight.minimumRemaining <= 0.01) {
        return 'Minimum met';
      }
      return `${formatCurrency(insight.minimumRemaining)} still required`;
    }
    if (insight.minimumTarget) {
      return 'Tracking minimum spend';
    }
    if (!insight.cardMinimumMet) {
      return 'Minimum pending';
    }
    return 'No minimum set';
  };

  const buildInsightNotes = (insight: CategoryCardInsight, period: string | undefined) => {
    const notes: string[] = [];
    if (!insight.hasData) {
      notes.push(period ? 'No eligible transactions recorded in this period.' : 'No spending data yet.');
    }
    if (insight.minimumRemaining != null && insight.minimumRemaining > 0.01) {
      notes.push(`${formatCurrency(insight.minimumRemaining)} more spend needed to unlock rewards.`);
    }
    if (insight.headroomToMaximum != null) {
      if (insight.headroomToMaximum <= 0.01) {
        notes.push('Spending cap reached for this category.');
      } else {
        notes.push(`You can spend up to ${formatCurrency(insight.headroomToMaximum)} more before the cap.`);
      }
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
              Group your card subcategories under broader themes before we can suggest the right cards.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Visit the Rules page, bundle your subcategories, then return here for tailored recommendations.
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
              Run the rewards computation on your dashboard so we can crunch the numbers for each category.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Once the latest period is computed, this page will surface the best cards and any cap warnings.
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
        <div>
          <h1 className="text-3xl font-bold">Recommendations</h1>
          <p className="mt-1 text-muted-foreground">
            Review the best cards for each spending category based on your latest calculations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/rules?tab=categories">Open rules</Link>
          </Button>
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
          const notes = best ? buildInsightNotes(best, recommendation.latestPeriod) : [];

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
                    {recommendation.latestPeriod
                      ? `Latest period analysed: ${recommendation.latestPeriod}`
                      : 'No reward calculations recorded yet.'}
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
                      <MetricPill
                        label="Minimum spend"
                        value={formatProgress(best.minimumProgress ?? best.cardMinimumProgress)}
                        helper={describeMinimum(best)}
                      />
                      {(() => {
                        const headroom = summariseHeadroom(best);
                        return (
                          <MetricPill
                            label="Spend before cap"
                            value={headroom.value}
                            helper={headroom.helper}
                          />
                        );
                      })()}
                    </div>
                    {notes.length > 0 && (
                      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {notes.map((note, index) => (
                          <li key={index}>{note}</li>
                        ))}
                      </ul>
                    )}
                    {!recommendation.latestPeriod && (
                      <Alert className="mt-4">
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Run “Compute now” on the Rewards dashboard to pull in the latest transactions for these recommendations.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No cards mapped to this group yet. Link your card subcategories under Rules to see recommendations here.
                  </p>
                )}

                {runners.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase text-muted-foreground">Other card options</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {runners.map((insight) => {
                        const runnerNotes = buildInsightNotes(insight, recommendation.latestPeriod);
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
                              {(() => {
                                const headroom = summariseHeadroom(insight);
                                return `Spend before cap: ${headroom.value} • Minimum: ${describeMinimum(insight)}`;
                              })()}
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
