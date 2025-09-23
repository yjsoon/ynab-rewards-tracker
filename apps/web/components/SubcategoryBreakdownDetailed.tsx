'use client';

import { cn } from '@/lib/utils';
import { CurrencyAmount } from './CurrencyAmount';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getFlagHex } from '@/lib/flag-colors';

interface SubcategoryBreakdown {
  subcategoryId?: string;
  flagColor: string;
  name: string;
  totalSpend: number;
  eligibleSpend: number;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  minimumSpendMet?: boolean;
  maximumSpendExceeded?: boolean;
  maximumSpend?: number | null;
}

interface SubcategoryBreakdownDetailedProps {
  breakdowns: SubcategoryBreakdown[];
  cardType: 'cashback' | 'miles';
  currency: string;
  totalCardSpend: number;
  totalCardReward: number;
}

// Map flag colours to actual colours for visual representation
const FLAG_COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  red: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-900',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500'
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-900',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500'
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/20',
    border: 'border-yellow-200 dark:border-yellow-900',
    text: 'text-yellow-700 dark:text-yellow-300',
    dot: 'bg-yellow-500'
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-900',
    text: 'text-green-700 dark:text-green-300',
    dot: 'bg-green-500'
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-900',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    border: 'border-purple-200 dark:border-purple-900',
    text: 'text-purple-700 dark:text-purple-300',
    dot: 'bg-purple-500'
  },
  unflagged: {
    bg: 'bg-gray-50 dark:bg-gray-950/20',
    border: 'border-gray-200 dark:border-gray-900',
    text: 'text-gray-700 dark:text-gray-300',
    dot: 'bg-gray-500'
  },
};

export function SubcategoryBreakdownDetailed({
  breakdowns,
  cardType,
  currency,
  totalCardSpend,
  totalCardReward,
}: SubcategoryBreakdownDetailedProps) {
  if (breakdowns.length === 0) return null;

  // Sort breakdowns by reward earned (highest first)
  const sortedBreakdowns = [...breakdowns].sort((a, b) => b.rewardEarned - a.rewardEarned);

  // Calculate percentages and effective rates
  const enrichedBreakdowns = sortedBreakdowns.map(b => ({
    ...b,
    spendPercentage: totalCardSpend > 0 ? (b.totalSpend / totalCardSpend) * 100 : 0,
    rewardPercentage: totalCardReward > 0 ? (b.rewardEarned / totalCardReward) * 100 : 0,
    effectiveRate: b.eligibleSpend > 0
      ? cardType === 'cashback'
        ? (b.rewardEarned / b.eligibleSpend) * 100
        : b.rewardEarned / b.eligibleSpend
      : 0,
  }));

  // Identify the best-performing subcategory by effective rate
  const bestPerformer = enrichedBreakdowns.reduce((best, current) =>
    current.effectiveRate > best.effectiveRate ? current : best
  );

  return (
    <div className="space-y-4">
      {/* Visual Bar Chart */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg bg-muted/30 border border-border/40">
          {enrichedBreakdowns.map((segment, index) => {
            const color = segment.maximumSpendExceeded ? '#ef4444' : getFlagHex(segment.flagColor);
            const width = segment.spendPercentage;

            if (width < 0.5) return null; // Skip tiny segments

            return (
              <div
                key={segment.subcategoryId || `${segment.flagColor}-${index}`}
                className="relative flex items-center justify-center transition-all hover:opacity-80"
                style={{
                  width: `${width}%`,
                  backgroundColor: color,
                  opacity: segment.rewardEarned === 0 ? 0.3 : 0.9,
                }}
                title={`${segment.name}: ${currency}${segment.totalSpend.toFixed(2)}${segment.maximumSpendExceeded ? ' (Maxed)' : ''}`}
              >
                {width > 10 && (
                  <span className="text-[11px] font-bold text-white drop-shadow">
                    {Math.round(width)}%
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {/* Grid Layout for Subcategory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {enrichedBreakdowns.map((entry, index) => {
          const colorScheme = FLAG_COLOR_MAP[entry.flagColor] || FLAG_COLOR_MAP.unflagged;
          const isBest = entry === bestPerformer && enrichedBreakdowns.length > 1 && !entry.maximumSpendExceeded;
          const isCapped = entry.maximumSpendExceeded;

          return (
            <div
              key={entry.subcategoryId || `${entry.flagColor}-${index}`}
              className={cn(
                "relative rounded-lg border p-4 transition-all hover:shadow-sm",
                isCapped ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : `${colorScheme.border} ${colorScheme.bg}`
              )}
            >
              {/* Badge for best performer or maxed out */}
              {(isBest || isCapped) && (
                <div className={cn(
                  "absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  isCapped ? "bg-red-500 text-white" : "bg-green-500 text-white"
                )}>
                  {isCapped ? "Maxed" : "Best"}
                </div>
              )}

              <div className="space-y-3">
                {/* Header with flag and name */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-4 w-4 rounded-full flex-shrink-0",
                        isCapped ? "bg-red-500" : colorScheme.dot
                      )}
                    />
                    <div>
                      <h4 className="font-semibold text-sm">{entry.name}</h4>
                    </div>
                  </div>
                  {/* Trend indicator */}
                  <div className={cn(
                    "flex items-center gap-1 text-xs",
                    entry.effectiveRate > (cardType === 'cashback' ? 2 : 1.5) ? "text-green-600" :
                    entry.effectiveRate > (cardType === 'cashback' ? 1 : 0.75) ? "text-blue-600" :
                    "text-gray-500"
                  )}>
                    {entry.effectiveRate > (cardType === 'cashback' ? 2 : 1.5) ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : entry.effectiveRate < (cardType === 'cashback' ? 1 : 0.75) ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                    {cardType === 'cashback' ? `${entry.effectiveRate.toFixed(2)}%` : `${entry.effectiveRate.toFixed(2)}x`}
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {/* Spent */}
                  <div>
                    <p className="text-xs text-muted-foreground">Spent</p>
                    <p className="font-semibold">
                      <CurrencyAmount value={entry.totalSpend} currency={currency} />
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {entry.spendPercentage.toFixed(1)}% of total
                    </p>
                  </div>

                  {/* Earned */}
                  <div>
                    <p className="text-xs text-muted-foreground">Earned</p>
                    <p className="font-semibold">
                      {cardType === 'cashback' ? (
                        <CurrencyAmount value={entry.rewardEarned} currency={currency} />
                      ) : (
                        <>{Math.round(entry.rewardEarned).toLocaleString()} mi</>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {entry.rewardPercentage.toFixed(1)}% of rewards
                    </p>
                  </div>
                </div>

                {/* Progress bar to maximum if applicable */}
                {entry.maximumSpend && entry.maximumSpend > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Cap progress</span>
                      <span>
                        <CurrencyAmount value={entry.totalSpend} currency={currency} />
                        {' / '}
                        <CurrencyAmount value={entry.maximumSpend} currency={currency} />
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isCapped ? "bg-red-500" : "bg-blue-500"
                        )}
                        style={{ width: `${Math.min(100, (entry.totalSpend / entry.maximumSpend) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}