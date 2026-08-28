'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  hasSubcategoryMaximum,
  subcategoryRowFillPercent,
  uncappedSubcategoryScale,
} from '@/lib/subcategory-row-fill';
import { CurrencyAmount } from './CurrencyAmount';
import { getFlagHex, getFlagBorderColor } from '@/lib/flag-colors';

interface SubcategoryBreakdown {
  id?: string;
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
  transactionsHref?: string;
}

const ROW_STAGGER_MS = 45;

export function SubcategoryBreakdownCompact({
  breakdowns,
  currency,
  isExpanded: controlledIsExpanded,
  onToggleExpanded,
  compactSubtitles = false,
  transactionsHref,
}: SubcategoryBreakdownCompactProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const contentId = useId();

  // Use controlled state if provided, otherwise use internal state
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;
  const handleToggle = onToggleExpanded || (() => setInternalIsExpanded(!internalIsExpanded));

  const onToggleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    handleToggle();
  };

  if (breakdowns.length === 0) return null;

  // Sort breakdowns by reward earned (highest first)
  const sortedBreakdowns = [...breakdowns].sort((a, b) => b.rewardEarned - a.rewardEarned);

  // Calculate percentages for stacked bar
  const totalSpend = breakdowns.reduce((sum, b) => sum + b.totalSpend, 0);
  const uncappedScale = uncappedSubcategoryScale(breakdowns);
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
      {/* Header — the whole row toggles the breakdown */}
      <button
        type="button"
        onClick={onToggleClick}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="group flex w-full items-center justify-between rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
          Subcategories
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out group-hover:text-foreground',
            isExpanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Stacked bar — tapping it toggles the breakdown too */}
      <button
        type="button"
        onClick={onToggleClick}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-label={isExpanded ? 'Hide subcategory details' : 'Show subcategory details'}
        title={isExpanded ? 'Hide subcategory details' : 'Show subcategory details'}
        className="block w-full cursor-pointer rounded-md transition-transform duration-150 ease-out hover:scale-[1.015] active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="flex h-6 w-full overflow-hidden rounded-md bg-muted/30 border border-border/40">
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
              <span
                key={segment.subcategoryId || `${segment.flagColor}-${index}`}
                className="relative flex items-center justify-center"
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
              </span>
            );
          })}
        </span>
      </button>

      {/* Detail rows — animated open/close with a gentle stagger */}
      <div
        id={contentId}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pb-0.5">
            {sortedBreakdowns.map((entry, index) => {
              const borderColor = getFlagBorderColor(entry.flagColor, 0.4);
              const flagColor = getFlagHex(entry.flagColor);

              // Capped rows show progress toward their maximum. Uncapped rows scale
              // against the largest uncapped spend so the list uses the full row width.
              const hasCap = hasSubcategoryMaximum(entry.maximumSpend);
              const progress = subcategoryRowFillPercent({
                totalSpend: entry.totalSpend,
                maximumSpend: entry.maximumSpend,
                uncappedScale,
              });

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
              const subcategoryId = entry.subcategoryId ?? entry.id;
              const categoryHref = transactionsHref && subcategoryId
                ? `${transactionsHref}${transactionsHref.includes('?') ? '&' : '?'}category=${encodeURIComponent(subcategoryId)}`
                : null;
              const rowClassName = cn(
                'relative block overflow-hidden rounded-md border transition-all duration-300 ease-out',
                categoryHref && 'hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:brightness-110',
                isExpanded
                  ? isZero
                    ? 'translate-y-0 opacity-50'
                    : 'translate-y-0 opacity-100'
                  : 'translate-y-1 opacity-0',
              );
              const rowStyle = {
                borderColor,
                transitionDelay: isExpanded ? `${index * ROW_STAGGER_MS}ms` : '0ms',
              };
              const rowContent = (
                <>
                  <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
                    style={{
                      // Fill grows in from zero as the section opens
                      width: isExpanded ? `${progress}%` : '0%',
                      backgroundColor: flagColor,
                      opacity: 0.18,
                      transitionDelay: isExpanded ? `${index * ROW_STAGGER_MS}ms` : '0ms',
                    }}
                  />
                  <div className="relative flex min-h-[26px] items-center gap-1 px-1.5 py-1">
                    <div
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: flagColor }}
                    />
                    <span className="truncate text-[13px] font-medium">{entry.name}</span>
                    <span className="ml-auto whitespace-nowrap text-[13px]">
                      <span className="font-semibold">
                        <CurrencyAmount value={entry.totalSpend} currency={currency} decimals={compactSubtitles ? 0 : 2} />
                      </span>
                      {hasCap && (
                        <>
                          <span className="text-[11px] text-muted-foreground/70">
                            {'/'}
                            <CurrencyAmount value={entry.maximumSpend as number} currency={currency} decimals={0} />
                          </span>
                          <span className={`ml-1 ${pctClass}`}>{Math.round(progress)}%</span>
                        </>
                      )}
                    </span>
                  </div>
                </>
              );

              return categoryHref ? (
                <Link
                  key={subcategoryId || `${entry.flagColor}-${entry.name}`}
                  href={categoryHref}
                  className={rowClassName}
                  style={rowStyle}
                  tabIndex={isExpanded ? 0 : -1}
                  aria-hidden={!isExpanded}
                  aria-label={`View ${entry.name} transactions`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {rowContent}
                </Link>
              ) : (
                <div
                  key={subcategoryId || `${entry.flagColor}-${entry.name}`}
                  className={rowClassName}
                  style={rowStyle}
                >
                  {rowContent}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
