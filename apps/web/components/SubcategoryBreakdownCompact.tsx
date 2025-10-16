'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CurrencyAmount } from './CurrencyAmount';
import { getFlagHex, getFlagClasses, getFlagBorderColor } from '@/lib/flag-colors';

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
}

export function SubcategoryBreakdownCompact({
  breakdowns,
  cardType,
  currency,
}: SubcategoryBreakdownCompactProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (breakdowns.length === 0) return null;

  // Sort breakdowns by reward earned (highest first)
  const sortedBreakdowns = [...breakdowns].sort((a, b) => b.rewardEarned - a.rewardEarned);

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
            const color = isCapped ? '#ef4444' : getFlagHex(segment.flagColor);
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
            const flagColours = getFlagClasses(entry.flagColor);
            const borderColor = getFlagBorderColor(entry.flagColor, 0.4);

            return (
              <div
                key={entry.subcategoryId || `${entry.flagColor}-${entry.name}`}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border border-border p-2 sm:flex-row sm:items-center sm:justify-between",
                  flagColours.bg
                )}
                style={{ borderColor }}
              >
                <div className="flex flex-1 items-center gap-3">
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full flex-shrink-0',
                      entry.maximumSpendExceeded ? 'bg-red-500' : ''
                    )}
                    style={
                      !entry.maximumSpendExceeded
                        ? { backgroundColor: getFlagHex(entry.flagColor) }
                        : undefined
                    }
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
                        <span className="ml-1 text-red-600 font-medium">(maxed)</span>
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