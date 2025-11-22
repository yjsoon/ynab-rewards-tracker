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

export function calculateCardPeriod(card: CreditCard, targetDate: Date = new Date()): CardPeriod {
  const reference = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  // Check for promotional period override first
  if (card.promotionalPeriod) {
    // Parse end date as local time to avoid UTC timezone shifts
    const [endYear, endMonth, endDay] = card.promotionalPeriod.endDate.split('-').map(Number);
    const promoEnd = new Date(endYear, endMonth - 1, endDay);

    // Determine start date: use provided start or calculate from billing cycle
    let promoStart: Date;
    let startLabel: string;

    if (card.promotionalPeriod.startDate) {
      const [startYear, startMonth, startDay] = card.promotionalPeriod.startDate.split('-').map(Number);
      promoStart = new Date(startYear, startMonth - 1, startDay);
      startLabel = card.promotionalPeriod.startDate;
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

    // If current date is within promotional period, return it
    if (reference >= promoStart && reference <= promoEnd) {
      return {
        startDate: promoStart,
        endDate: promoEnd,
        label: `${startLabel} to ${card.promotionalPeriod.endDate}`,
      };
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