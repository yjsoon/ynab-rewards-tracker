'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';
import { CurrencyAmount } from './CurrencyAmount';

interface SubcategoryBreakdown {
  subcategoryId?: string;
  flagColor: string;
  name: string;
  totalSpend: number;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  minimumSpendMet?: boolean;
  maximumSpendExceeded?: boolean;
  maximumSpend?: number | null;
}

interface SubcategoryBreakdownCompactProps {
  breakdowns: SubcategoryBreakdown[];
  cardType: 'cashback' | 'miles';
  currency: string;
  flagNames: Record<string, string>;
  totalReward: number;
}

// Map flag colors to actual colors for visual representation
const FLAG_COLOR_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  unflagged: '#6b7280',
};

const FLAG_COLOR_BG_MAP: Record<string, string> = {
  red: 'bg-red-500/10',
  orange: 'bg-orange-500/10',
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  purple: 'bg-purple-500/10',
  unflagged: 'bg-gray-500/10',
};

export function SubcategoryBreakdownCompact({
  breakdowns,
  cardType,
  currency,
  flagNames,
  totalReward,
}: SubcategoryBreakdownCompactProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (breakdowns.length === 0) return null;

  // Sort breakdowns by reward earned (highest first)
  const sortedBreakdowns = [...breakdowns].sort((a, b) => b.rewardEarned - a.rewardEarned);
  const topBreakdowns = sortedBreakdowns.slice(0, 3);
  const hasMore = sortedBreakdowns.length > 3;

  // Calculate percentages for stacked bar
  const totalSpend = breakdowns.reduce((sum, b) => sum + b.totalSpend, 0);
  const segments = sortedBreakdowns.map(b => ({
    ...b,
    percentage: totalSpend > 0 ? (b.totalSpend / totalSpend) * 100 : 0,
  }));

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/5 p-2">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Subcategory rewards</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="mr-1 h-3 w-3" />
              Less
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-3 w-3" />
              More
            </>
          )}
        </Button>
      </div>

      {/* Stacked Bar Visualization */}
      <div className="space-y-1">
        <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted/30 border border-border/40">
          {segments.map((segment, index) => {
            const isCapped = segment.maximumSpendExceeded;
            const color = FLAG_COLOR_MAP[segment.flagColor] || FLAG_COLOR_MAP.unflagged;
            const width = segment.percentage;

            if (width < 0.5) return null; // Skip tiny segments

            return (
              <div
                key={segment.subcategoryId || `${segment.flagColor}-${index}`}
                className="relative flex items-center justify-center transition-all hover:opacity-80"
                style={{
                  width: `${width}%`,
                  backgroundColor: color,
                  opacity: segment.rewardEarned === 0 ? 0.3 : 0.8,
                }}
                title={`${segment.name}: ${currency}${segment.totalSpend.toFixed(2)}${isCapped ? ' (Capped)' : ''}`}
              >
                {width > 15 && (
                  isCapped ? (
                    segment.flagColor === 'red' ? (
                      <span className="px-0.5 py-0 bg-white text-red-600 text-[9px] font-bold rounded">
                        {Math.round(width)}%
                      </span>
                    ) : (
                      <span className="px-0.5 py-0 bg-red-600 text-white text-[9px] font-bold rounded">
                        {Math.round(width)}%
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-medium text-white drop-shadow">
                      {Math.round(width)}%
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded View - Show Details */}
      {isExpanded && (
        /* Expanded View - All Details */
        <div className="space-y-2">
          {sortedBreakdowns.map((entry) => {
            const flagLabel = flagNames[entry.flagColor as YnabFlagColor] ?? (
              entry.flagColor === UNFLAGGED_FLAG.value
                ? UNFLAGGED_FLAG.label
                : YNAB_FLAG_COLORS.find((flag) => flag.value === entry.flagColor)?.label ?? entry.flagColor
            );

            const rewardSummary = cardType === 'cashback'
              ? <CurrencyAmount value={entry.rewardEarned} currency={currency} />
              : (
                  <span>
                    {Math.round(entry.rewardEarned).toLocaleString()} miles
                    {entry.rewardEarnedDollars ? (
                      <span className="text-muted-foreground">
                        {' '}(<CurrencyAmount value={entry.rewardEarnedDollars} currency={currency} />)
                      </span>
                    ) : null}
                  </span>
                );

            const bgClass = FLAG_COLOR_BG_MAP[entry.flagColor] || FLAG_COLOR_BG_MAP.unflagged;

            return (
              <div
                key={entry.subcategoryId || `${entry.flagColor}-${entry.name}`}
                className={cn(
                  "flex flex-col gap-1 rounded-lg p-2 sm:flex-row sm:items-center sm:justify-between",
                  bgClass
                )}
              >
                <div className="flex flex-1 items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: entry.maximumSpendExceeded
                        ? '#ef4444'
                        : (FLAG_COLOR_MAP[entry.flagColor] || FLAG_COLOR_MAP.unflagged)
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm font-semibold">
                        {cardType === 'cashback' ? (
                          <CurrencyAmount value={entry.rewardEarned} currency={currency} />
                        ) : (
                          `${Math.round(entry.rewardEarned).toLocaleString()} miles`
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Spent <CurrencyAmount value={entry.totalSpend} currency={currency} />
                      {entry.maximumSpend && entry.maximumSpend > 0 && (
                        <>
                          {' / '}
                          <CurrencyAmount value={entry.maximumSpend} currency={currency} />
                          {' cap'}
                        </>
                      )}
                      {entry.maximumSpendExceeded && (
                        <span className="ml-1 text-red-600 font-medium">(reached)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}