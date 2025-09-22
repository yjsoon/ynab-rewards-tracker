/**
 * Compute current-period reward calculations for all active cards.
 * Fetches YNAB transactions, applies tag mappings, and runs the calculator.
 * Returns calculations; the caller decides how to persist them.
 */

import { YnabClient } from '@/lib/ynab-client';
import { RewardsCalculator } from './calculator';
import { TransactionMatcher } from './matcher';
import type {
  AppSettings,
  CreditCard,
  RewardCalculation,
  RewardRule,
} from '@/lib/storage';

function formatIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function periodOverlapsWindow(periodStart: Date, periodEnd: Date, start?: string, end?: string): boolean {
  const windowStart = start ? new Date(start) : undefined;
  const windowEnd = end ? new Date(end) : undefined;

  if (windowStart && periodEnd < windowStart) return false;
  if (windowEnd && periodStart > windowEnd) return false;
  return true;
}

export async function computeCurrentPeriod(
  pat: string,
  budgetId: string,
  cards: CreditCard[],
  allRules: RewardRule[],
  settings?: AppSettings,
  signal?: AbortSignal
): Promise<RewardCalculation[]> {
  const client = new YnabClient(pat);
  const results: RewardCalculation[] = [];

  const trackedCards = cards.filter(c => !!c.ynabAccountId);
  if (trackedCards.length === 0) return results;

  // Optimisation: single fetch for all transactions since the earliest period start
  const periods = trackedCards.map(c => RewardsCalculator.calculatePeriod(c));
  const earliest = periods.reduce((min, p) => p.startDate < min ? p.startDate : min, periods[0].startDate);
  const since = formatIsoDate(earliest);
  const allTxns = await client.getTransactions(budgetId, { since_date: since, signal });

  for (let i = 0; i < trackedCards.length; i++) {
    const card = trackedCards[i];
    const period = periods[i];

    const forCard = TransactionMatcher.filterForCard(allTxns, card.ynabAccountId);
    const inRange = TransactionMatcher.filterByDateRange(forCard, period.startDate, period.endDate);

    const rules = allRules.filter(r => r.cardId === card.id && r.active);
    for (const rule of rules) {
      if (!periodOverlapsWindow(period.startDate, period.endDate, rule.startDate, rule.endDate)) continue;
      const calc = RewardsCalculator.calculateRuleRewards(rule, inRange, period, settings);
      results.push(calc);
    }
  }

  return results;
}
