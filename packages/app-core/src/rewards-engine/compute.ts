/**
 * Compute current-period reward calculations for all active cards.
 * Note: This module requires a YNAB client to be provided by the consuming application.
 */

import { RewardsCalculator } from './calculator';
import { SimpleRewardsCalculator } from './simple-calculator';
import { TransactionMatcher } from './matcher';
import { formatLocalDate } from './date-utils';
import { periodOverlapsWindow } from './utils/periods';
import { createRewardCalculationFromSimple } from './utils/reward-calculation';
import type {
  AppSettings,
  CreditCard,
  RewardCalculation,
  RewardRule,
} from '../storage/types';

// The YNAB client interface that consuming apps must provide
export interface YnabClientInterface {
  getTransactions(budgetId: string, options?: { since_date?: string; signal?: AbortSignal }): Promise<any[]>;
}

export async function computeCurrentPeriod(
  ynabClient: YnabClientInterface,
  budgetId: string,
  cards: CreditCard[],
  allRules: RewardRule[],
  settings?: AppSettings,
  signal?: AbortSignal
): Promise<RewardCalculation[]> {
  const results: RewardCalculation[] = [];

  const trackedCards = cards.filter(c => !!c.ynabAccountId);
  if (trackedCards.length === 0) return results;

  const periods = trackedCards.map(c => RewardsCalculator.calculatePeriod(c));
  const earliest = periods.reduce((min, p) => p.startDate < min ? p.startDate : min, periods[0].startDate);
  const since = formatLocalDate(earliest);
  const allTxns = await ynabClient.getTransactions(budgetId, { since_date: since, signal });

  for (let i = 0; i < trackedCards.length; i++) {
    const card = trackedCards[i];
    const period = periods[i];

    const forCard = TransactionMatcher.filterForCard(allTxns, card.ynabAccountId);
    const inRange = TransactionMatcher.filterByDateRange(forCard, period.startDate, period.endDate);

    if (card.subcategoriesEnabled) {
      const simplePeriod = {
        start: formatLocalDate(period.startDate),
        end: formatLocalDate(period.endDate),
        label: period.name,
      };
      const simpleCalc = SimpleRewardsCalculator.calculateCardRewards(card, forCard, simplePeriod, settings);
      results.push(createRewardCalculationFromSimple(card, simpleCalc));
      continue;
    }

    const rules = allRules.filter(r => r.cardId === card.id && r.active);
    for (const rule of rules) {
      if (!periodOverlapsWindow(period.startDate, period.endDate, rule.startDate, rule.endDate)) continue;
      const calc = RewardsCalculator.calculateRuleRewards(rule, inRange, period, settings);
      results.push(calc);
    }
  }

  return results;
}