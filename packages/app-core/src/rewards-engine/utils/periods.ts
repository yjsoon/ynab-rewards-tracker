import type { CreditCard } from '../../storage/types';

import { formatLocalDate, getEffectiveBillingDay } from '../date-utils';

export interface CardPeriod {
  startDate: Date;
  endDate: Date;
  label: string;
}

function formatPeriodLabel(startDate: Date): string {
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function createCycleStart(year: number, month: number, requestedDay: number): Date {
  const effectiveDay = getEffectiveBillingDay(year, month, requestedDay);
  return new Date(year, month, effectiveDay);
}

/**
 * Parse ISO date string (YYYY-MM-DD) as local time with validation.
 * Returns null if the date string is invalid or malformed.
 */
function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  // Validate format: YYYY-MM-DD
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(dateStr)) {
    return null;
  }

  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);

  // Verify the date components match (catches invalid dates like 2024-02-30)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function calculateCardPeriod(card: CreditCard, targetDate: Date = new Date()): CardPeriod {
  const reference = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  // Check for promotional period override first
  // Promotional periods override the normal billing cycle only when:
  // 1. A valid promotional period is configured with a parseable end date
  // 2. The current reference date falls within the promotional window
  // If either condition fails, we fall through to normal billing cycle calculation
  if (card.promotionalPeriod) {
    // Parse end date with validation
    const promoEnd = parseLocalDate(card.promotionalPeriod.endDate);

    // Only proceed if we have a valid end date
    if (promoEnd) {
      // Determine start date: use provided start or calculate from billing cycle
      let promoStart: Date;
      let startLabel: string;
      let validPromoConfig = true;

      if (card.promotionalPeriod.startDate) {
        const parsedStart = parseLocalDate(card.promotionalPeriod.startDate);
        if (!parsedStart) {
          // Invalid start date - skip promotional period
          validPromoConfig = false;
        } else {
          promoStart = parsedStart;
          startLabel = card.promotionalPeriod.startDate;
        }
      } else {
        // No start date specified - calculate current period start based on billing cycle
        if (card.billingCycle?.type === 'billing' && card.billingCycle.dayOfMonth) {
          const requestedDay = card.billingCycle.dayOfMonth;
          const year = reference.getFullYear();
          const month = reference.getMonth();
          const currentStart = createCycleStart(year, month, requestedDay);

          promoStart = reference < currentStart
            ? createCycleStart(year, month - 1, requestedDay)
            : currentStart;
        } else {
          // Calendar month
          promoStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
        }
        startLabel = formatLocalDate(promoStart);
      }

      // If current date is within promotional period and dates are valid, return it
      // Otherwise fall through to normal billing cycle calculation below
      if (validPromoConfig && reference >= promoStart! && reference <= promoEnd) {
        return {
          startDate: promoStart!,
          endDate: promoEnd,
          label: `${startLabel!} to ${card.promotionalPeriod.endDate}`,
        };
      }
    }
  }

  if (card.billingCycle?.type === 'billing' && card.billingCycle.dayOfMonth) {
    const requestedDay = card.billingCycle.dayOfMonth;
    const year = reference.getFullYear();
    const month = reference.getMonth();

    const currentStart = createCycleStart(year, month, requestedDay);

    if (reference < currentStart) {
      const startDate = createCycleStart(year, month - 1, requestedDay);
      const endDate = new Date(currentStart.getTime() - 1);

      return {
        startDate,
        endDate,
        label: formatPeriodLabel(startDate),
      };
    }

    const nextStart = createCycleStart(year, month + 1, requestedDay);
    const endDate = new Date(nextStart.getTime() - 1);

    return {
      startDate: currentStart,
      endDate,
      label: formatPeriodLabel(currentStart),
    };
  }

  const year = reference.getFullYear();
  const month = reference.getMonth();

  const startDate = new Date(year, month, 1);
  const endDate = new Date(startDate.getTime());
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setTime(endDate.getTime() - 1);

  return {
    startDate,
    endDate,
    label: formatPeriodLabel(startDate),
  };
}

export function getRecentCardPeriods(card: CreditCard, count: number = 3): CardPeriod[] {
  const periods: CardPeriod[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(calculateCardPeriod(card, target));
  }

  return periods;
}

export function toSimplePeriod(period: CardPeriod, useStartDateLabel: boolean = false): {
  start: string;
  end: string;
  label: string;
} {
  return {
    start: formatLocalDate(period.startDate),
    end: formatLocalDate(period.endDate),
    label: useStartDateLabel ? formatLocalDate(period.startDate) : period.label,
  };
}

export function periodOverlapsWindow(
  periodStart: Date,
  periodEnd: Date,
  windowStart?: string,
  windowEnd?: string
): boolean {
  const startBoundary = windowStart ? new Date(windowStart) : undefined;
  const endBoundary = windowEnd ? new Date(windowEnd) : undefined;

  if (startBoundary && periodEnd < startBoundary) {
    return false;
  }

  if (endBoundary && periodStart > endBoundary) {
    return false;
  }

  return true;
}

/**
 * Calculate the earliest period start date across all cards.
 * Useful for fetching transactions that cover all billing cycles,
 * including cards with non-calendar billing cycles that extend into the previous month.
 *
 * @param cards - Array of credit cards to check
 * @param targetDate - Optional date to calculate periods for (defaults to now)
 * @returns ISO date string (YYYY-MM-DD) of the earliest period start
 */
export function getEarliestPeriodStart(cards: CreditCard[], targetDate: Date = new Date()): string {
  const now = targetDate;
  let earliestStart = new Date(now.getFullYear(), now.getMonth(), 1); // Default to start of current month

  cards.forEach(card => {
    const period = calculateCardPeriod(card, targetDate);
    if (period.startDate < earliestStart) {
      earliestStart = period.startDate;
    }
  });

  return formatLocalDate(earliestStart);
}