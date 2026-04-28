'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CurrencyAmount } from './CurrencyAmount';
import { getFlagHex, getFlagBorderColor } from '@/lib/flag-colors';

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
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  /** Controls decimal precision on the inline spent amount: true → 0dp, false → 2dp. */
  compactSubtitles?: boolean;
}

export function SubcategoryBreakdownCompact({
  breakdowns,
  currency,
  isExpanded: controlledIsExpanded,
  onToggleExpanded,
  compactSubtitles = false,
}: SubcategoryBreakdownCompactProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;
  const handleToggle = onToggleExpanded || (() => setInternalIsExpanded(!internalIsExpanded));

  if (breakdowns.length === 0) return null;

  // Sort breakdowns by reward earned (highest first)
  const sortedBreakdowns = [...breakdowns].sort((a, b) => b.rewardEarned - a.rewardEarned);

  // Calculate percentages for stacked bar
  const totalSpend = breakdowns.reduce((sum, b) => sum + b.totalSpend, 0);
  const segments = sortedBreakdowns.map(b => {
    // Calculate cap progress percentage if there's a maximum spend limit
    const capProgress = b.maximumSpend && b.maximumSpend > 0
      ? (b.totalSpend / b.maximumSpend) * 100
      : null;

    // Determine pill colour based on cap progress
    const pillBg = 'rgba(255, 255, 255, 0.5)'; // 50% white background
    let pillText = 'rgba(17, 24, 39, 0.95)'; // nearly black (gray-900)

    if (capProgress !== null && capProgress >= 90) {
      // Red zone: 90%+ of cap
      pillText = 'rgba(220, 38, 38, 1)'; // red-600
    }

    return {
      ...b,
      spendSharePercentage: totalSpend > 0 ? (b.totalSpend / totalSpend) * 100 : 0,
      capProgress,
      pillBg,
      pillText,
    };
  });

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/5 p-2">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Subcategories</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs touch-action-manipulation"
          style={{ touchAction: 'manipulation' }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            handleToggle();
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
            const color = getFlagHex(segment.flagColor);
            const width = segment.spendSharePercentage;

            if (width < 0.5) return null; // Skip tiny segments

            // Determine what to display
            const displayText = segment.capProgress !== null
              ? `${Math.round(segment.capProgress)}%`
              : `$${Math.round(segment.totalSpend)}`;

            const tooltipText = segment.capProgress !== null
              ? `${segment.name}: ${Math.round(segment.capProgress)}% of $${segment.maximumSpend?.toFixed(2)} cap (spent $${segment.totalSpend.toFixed(2)})`
              : `${segment.name}: $${segment.totalSpend.toFixed(2)} spent (no cap)`;

            return (
              <div
                key={segment.subcategoryId || `${segment.flagColor}-${index}`}
                className="relative flex items-center justify-center transition-all hover:opacity-80"
                style={{
                  width: `${width}%`,
                  backgroundColor: color,
                  opacity: 0.9,
                }}
                title={tooltipText}
              >
                {width > 12 && (
                  <span
                    className="px-0.5 py-0 rounded text-[11px] font-bold leading-none"
                    style={{
                      backgroundColor: segment.pillBg,
                      color: segment.pillText,
                    }}
                  >
                    {displayText}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded View - Show Details */}
      {isExpanded && (
        <div className="space-y-1">
          {sortedBreakdowns.map((entry) => {
            const borderColor = getFlagBorderColor(entry.flagColor, 0.4);
            const flagColor = getFlagHex(entry.flagColor);

            // Background fill width: with a cap, show cap progress. Without one, fall back to
            // this row's share of total subcategory spend so the bar still conveys weight.
            const hasCap = !!(entry.maximumSpend && entry.maximumSpend > 0);
            const progress = hasCap
              ? Math.min(100, (entry.totalSpend / (entry.maximumSpend as number)) * 100)
              : totalSpend > 0
                ? (entry.totalSpend / totalSpend) * 100
                : 0;

            // Cap-pressure colour for the inline percentage text.
            let pctClass = 'text-muted-foreground';
            if (hasCap) {
              if (entry.maximumSpendExceeded || progress >= 90) {
                pctClass = 'text-red-600 dark:text-red-400 font-medium';
              } else if (progress >= 75) {
                pctClass = 'text-amber-600 dark:text-amber-400 font-medium';
              }
            }

            const isZero = entry.totalSpend <= 0;

            return (
              <div
                key={entry.subcategoryId || `${entry.flagColor}-${entry.name}`}
                className={`relative overflow-hidden rounded-md border ${isZero ? 'opacity-50' : ''}`}
                style={{ borderColor }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: flagColor,
                    opacity: 0.18,
                  }}
                />
                <div className="relative flex min-h-[26px] items-center gap-2 px-2.5 py-1">
                  <div
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: flagColor }}
                  />
                  <span className="truncate text-sm font-medium">{entry.name}</span>
                  <span className="ml-auto whitespace-nowrap text-sm">
                    <span className="font-semibold">
                      <CurrencyAmount value={entry.totalSpend} currency={currency} decimals={compactSubtitles ? 0 : 2} />
                    </span>
                    {hasCap && (
                      <>
                        <span className="text-muted-foreground/70">
                          {' / '}
                          <CurrencyAmount value={entry.maximumSpend as number} currency={currency} decimals={0} />
                        </span>
                        <span className={`ml-1.5 ${pctClass}`}>{Math.round(progress)}%</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}