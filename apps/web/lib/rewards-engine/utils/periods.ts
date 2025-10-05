import type { CreditCard } from '@/lib/storage';

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
