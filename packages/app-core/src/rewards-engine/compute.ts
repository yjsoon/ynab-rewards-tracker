/**
 * Compute current-period reward calculations for all active cards.
 * Note: This module requires a YNAB client to be provided by the consuming application.
 */

import { RewardsCalculator } from './calculator';
import { SimpleRewardsCalculator } from './simple-calculator';
import { TransactionMatcher } from './matcher';
import { formatLocalDate, parseYnabDate } from './date-utils';
import { periodOverlapsWindow } from './utils/periods';
import { createRewardCalculationFromSimple } from './utils/reward-calculation';
import type {
  AppSettings,
  CreditCard,
  RewardCalculation,
  RewardRule,
  TransactionWithRewards,
} from '../storage/types';

// The YNAB client interface that consuming apps must provide
export interface YnabClientInterface {
  getTransactions(
    budgetId: string,
    options?: { since_date?: string; signal?: AbortSignal }
  ): Promise<TransactionWithRewards[]>;
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
  const txnsByAccount = new Map<string, TransactionWithRewards[]>();

  for (const txn of allTxns) {
    if (txn.amount >= 0) continue;
    const bucket = txnsByAccount.get(txn.account_id);
    if (bucket) {
      bucket.push(txn);
    } else {
      txnsByAccount.set(txn.account_id, [txn]);
    }
  }

  for (let i = 0; i < trackedCards.length; i++) {
    const card = trackedCards[i];
    const period = periods[i];

    const forCard = txnsByAccount.get(card.ynabAccountId) ?? [];
    const inRange = TransactionMatcher.filterByDateRange(forCard, period.startDate, period.endDate);
    const simplePeriod = {
      start: formatLocalDate(period.startDate),
      end: formatLocalDate(period.endDate),
      label: period.name,
    };

    if (card.subcategoriesEnabled) {
      const simpleCalc = SimpleRewardsCalculator.calculateCardRewards(card, forCard, simplePeriod, settings);
      results.push(createRewardCalculationFromSimple(card, simpleCalc));
      continue;
    }

    const rules = allRules.filter(r => r.cardId === card.id && r.active);
    if (rules.length === 0 && card.earningRate && card.earningRate > 0) {
      const simpleCalc = SimpleRewardsCalculator.calculateCardRewards(card, forCard, simplePeriod, settings);
      results.push(createRewardCalculationFromSimple(card, simpleCalc));
      continue;
    }

    for (const rule of rules) {
      if (!periodOverlapsWindow(period.startDate, period.endDate, rule.startDate, rule.endDate)) continue;
      const rulePeriod = {
        ...period,
        startDate: maxDate(period.startDate, parseYnabDate(rule.startDate)),
        endDate: minDate(period.endDate, parseYnabDate(rule.endDate)),
      };
      const calc = RewardsCalculator.calculateRuleRewards(rule, inRange, rulePeriod, settings);
      results.push(calc);
    }
  }

  return results;
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
