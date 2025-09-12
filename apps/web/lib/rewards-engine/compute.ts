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
  TagMapping,
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
  allMappings: TagMapping[],
  settings?: AppSettings
): Promise<RewardCalculation[]> {
  const client = new YnabClient(pat);
  const results: RewardCalculation[] = [];

  const activeCards = cards.filter(c => c.active);

  for (const card of activeCards) {
    const period = RewardsCalculator.calculatePeriod(card);

    // Fetch transactions since period start
    const since = formatIsoDate(period.startDate);
    const txns = await client.getTransactions(budgetId, { since_date: since });

    // Apply tag mappings for this card, then filter for account and date range
    const mappings = allMappings.filter(m => m.cardId === card.id);
    const withCats = TransactionMatcher.applyTagMappings(txns, mappings);
    const forCard = TransactionMatcher.filterForCard(withCats, card.ynabAccountId);
    const inRange = TransactionMatcher.filterByDateRange(forCard, period.startDate, period.endDate);

    // Compute for each active rule with overlapping window
    const rules = allRules.filter(r => r.cardId === card.id && r.active);
    for (const rule of rules) {
      if (!periodOverlapsWindow(period.startDate, period.endDate, rule.startDate, rule.endDate)) {
        continue;
      }
      const calc = RewardsCalculator.calculateRuleRewards(rule, inRange, period, settings);
      results.push(calc);
    }
  }

  return results;
}

