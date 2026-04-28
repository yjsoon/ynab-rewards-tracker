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
  /** When true, show compact one-liner "Cap $X • Avail $Z". When false, show full detail. */
  compactSubtitles?: boolean;
}

export function SubcategoryBreakdownCompact({
  breakdowns,
  cardType,
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
        /* Expanded View - All Details */
        <div className="space-y-2">
          {sortedBreakdowns.map((entry) => {
            const borderColor = getFlagBorderColor(entry.flagColor, 0.4);
            const flagColor = getFlagHex(entry.flagColor);

            // Calculate progress percentage for background fill.
            // With a cap, show how full the cap is. Without a cap, fall back to this
            // subcategory's share of total spend so the row still gives a visual weight.
            const hasCap = !!(entry.maximumSpend && entry.maximumSpend > 0);
            const progress = hasCap
              ? Math.min(100, (entry.totalSpend / (entry.maximumSpend as number)) * 100)
              : totalSpend > 0
                ? (entry.totalSpend / totalSpend) * 100
                : 0;

            return (
              <div
                key={entry.subcategoryId || `${entry.flagColor}-${entry.name}`}
                className="relative overflow-hidden rounded-lg border p-2"
                style={{ borderColor }}
              >
                {/* Progress bar background fill */}
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: flagColor,
                    opacity: 0.15,
                  }}
                />
                {/* Colored left border accent */}
                <div
                  className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
                  style={{ backgroundColor: flagColor }}
                />
                {/* Content */}
                <div className="relative flex flex-1 items-center gap-3 pl-2">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: flagColor }}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm font-semibold">
                        <CurrencyAmount value={entry.totalSpend} currency={currency} decimals={compactSubtitles ? 0 : 2} />
                      </span>
                    </div>
                    {compactSubtitles ? (
                      /* Summary mode: single line "Cap $X • Avail $Z" - no decimals */
                      entry.maximumSpend && entry.maximumSpend > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Cap <CurrencyAmount value={entry.maximumSpend} currency={currency} decimals={0} />
                          {' • '}
                          Avail <CurrencyAmount value={Math.max(0, entry.maximumSpend - entry.totalSpend)} currency={currency} decimals={0} />
                        </p>
                      ) : null
                    ) : (
                      /* Detailed mode: two lines */
                      <div className="text-xs text-muted-foreground">
                        {entry.maximumSpend && entry.maximumSpend > 0 ? (
                          <p>
                            Cap <CurrencyAmount value={entry.maximumSpend} currency={currency} />
                            {' '}
                            <span className={entry.maximumSpendExceeded ? 'text-red-600 font-medium' : ''}>
                              ({Math.round(progress)}%)
                            </span>
                          </p>
                        ) : null}
                        {entry.maximumSpend && entry.maximumSpend > 0 ? (
                          <p>
                            Avail <CurrencyAmount value={Math.max(0, entry.maximumSpend - entry.totalSpend)} currency={currency} />
                            {entry.rewardEarned > 0 && (
                              <>
                                {' • '}
                                {cardType === 'cashback' ? (
                                  <><CurrencyAmount value={entry.rewardEarned} currency={currency} /> rebate</>
                                ) : (
                                  <>{Math.round(entry.rewardEarned).toLocaleString()} miles</>
                                )}
                              </>
                            )}
                          </p>
                        ) : entry.rewardEarned > 0 ? (
                          <p>
                            {cardType === 'cashback' ? (
                              <><CurrencyAmount value={entry.rewardEarned} currency={currency} /> rebate</>
                            ) : (
                              <>{Math.round(entry.rewardEarned).toLocaleString()} miles</>
                            )}
                          </p>
                        ) : null}
                      </div>
                    )}
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