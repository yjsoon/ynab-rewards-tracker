'use client';

import { cn } from '@/lib/utils';
import { CurrencyAmount } from '@/components/CurrencyAmount';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface SpendingProgressBarProps {
  totalSpend: number;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  currency?: string;
  className?: string;
  showLabels?: boolean;
  showWarnings?: boolean;
}

export function SpendingProgressBar({
  totalSpend,
  minimumSpend,
  maximumSpend,
  currency,
  className,
  showLabels = true,
  showWarnings = true
}: SpendingProgressBarProps) {
  // Determine configuration
  const hasMinimum = typeof minimumSpend === 'number' && minimumSpend > 0;
  const hasMaximum = typeof maximumSpend === 'number' && maximumSpend > 0;
  const hasLimits = hasMinimum || hasMaximum;

  // Calculate progress percentages
  const getProgressPercentage = () => {
    if (!hasLimits) return 0;

    if (hasMaximum) {
      // Cap at maximum for display
      return Math.min(100, (totalSpend / maximumSpend) * 100);
    }

    if (hasMinimum) {
      // Show progress towards minimum
      return Math.min(100, (totalSpend / minimumSpend) * 100);
    }

    return 0;
  };

  // Determine spending zone and color
  const getSpendingZone = () => {
    if (!hasLimits) return 'neutral';

    const minimumMet = !hasMinimum || totalSpend >= minimumSpend;
    const maximumExceeded = hasMaximum && totalSpend > maximumSpend;

    if (maximumExceeded) return 'exceeded'; // Red zone - no rewards
    if (minimumMet) return 'earning'; // Green zone - earning rewards
    return 'pending'; // Yellow zone - not earning yet
  };

  // Get marker positions for min/max thresholds
  const getMarkerPosition = (threshold: number) => {
    if (!hasMaximum) {
      // If no maximum, scale based on higher of threshold or totalSpend
      const scale = Math.max(threshold, totalSpend) * 1.2;
      return (threshold / scale) * 100;
    }
    // Scale based on maximum
    return Math.min(100, (threshold / maximumSpend) * 100);
  };

  const progressPercent = getProgressPercentage();
  const spendingZone = getSpendingZone();

  // Determine bar colors based on zone
  const getBarColor = () => {
    switch (spendingZone) {
      case 'exceeded':
        return 'bg-gradient-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700';
      case 'earning':
        return 'bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700';
      case 'pending':
        return 'bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700';
      default:
        return 'bg-muted';
    }
  };

  const barColor = getBarColor();
  const minimumPosition = hasMinimum ? getMarkerPosition(minimumSpend) : null;
  const maximumPosition = hasMaximum ? getMarkerPosition(maximumSpend) : null;

  // Calculate remaining amounts
  const remainingToMinimum = hasMinimum ? Math.max(0, minimumSpend - totalSpend) : 0;
  const remainingToMaximum = hasMaximum ? Math.max(0, maximumSpend - totalSpend) : 0;
  const exceededAmount = hasMaximum && totalSpend > maximumSpend ? totalSpend - maximumSpend : 0;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress labels */}
      {showLabels && hasLimits && (
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-muted-foreground">
            Spent: <CurrencyAmount value={totalSpend} currency={currency} />
          </span>
          <span className={cn(
            "flex items-center gap-1",
            spendingZone === 'exceeded' && "text-red-600 dark:text-red-400",
            spendingZone === 'earning' && "text-emerald-600 dark:text-emerald-400",
            spendingZone === 'pending' && "text-amber-600 dark:text-amber-400"
          )}>
            {spendingZone === 'exceeded' && (
              <>
                <XCircle className="h-3 w-3" />
                No rewards zone
              </>
            )}
            {spendingZone === 'earning' && (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Earning rewards
              </>
            )}
            {spendingZone === 'pending' && (
              <>
                <AlertCircle className="h-3 w-3" />
                Below minimum
              </>
            )}
          </span>
        </div>
      )}

      {/* Progress bar container */}
      <div className="relative">
        {/* Background bar */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted/20">
          {/* Progress fill */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              barColor
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Minimum spend marker */}
        {hasMinimum && minimumPosition !== null && hasMaximum && (
          <div
            className="absolute top-0 h-3 w-0.5 bg-foreground/40"
            style={{ left: `${minimumPosition}%` }}
            title={`Minimum: ${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: currency || 'USD'
            }).format(minimumSpend)}`}
          />
        )}

        {/* Maximum spend marker (always visible if configured) */}
        {hasMaximum && maximumPosition !== null && (
          <div
            className="absolute top-0 h-3 w-0.5 bg-red-600 dark:bg-red-500"
            style={{ left: `${maximumPosition}%` }}
            title={`Maximum: ${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: currency || 'USD'
            }).format(maximumSpend)}`}
          />
        )}
      </div>

      {/* Threshold labels */}
      {showLabels && hasLimits && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <div className="flex gap-3">
            {hasMinimum && (
              <span>
                Min: <CurrencyAmount value={minimumSpend} currency={currency} />
              </span>
            )}
            {hasMaximum && (
              <span>
                Max: <CurrencyAmount value={maximumSpend} currency={currency} />
              </span>
            )}
          </div>
          {showWarnings && (
            <div>
              {spendingZone === 'pending' && remainingToMinimum > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  <CurrencyAmount value={remainingToMinimum} currency={currency} /> to minimum
                </span>
              )}
              {spendingZone === 'earning' && hasMaximum && remainingToMaximum > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  <CurrencyAmount value={remainingToMaximum} currency={currency} /> until cap
                </span>
              )}
              {spendingZone === 'exceeded' && exceededAmount > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  <CurrencyAmount value={exceededAmount} currency={currency} /> over limit
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* No limits message */}
      {!hasLimits && (
        <div className="text-center text-xs text-muted-foreground">
          No spending limits configured
        </div>
      )}
    </div>
  );
}