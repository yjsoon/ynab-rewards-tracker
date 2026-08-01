import { SimpleRewardsCalculator } from '@ynab-counter/app-core/rewards-engine';
import { createRewardCalculationFromSimple } from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';
import {
  formatCalculationPeriod,
  normalizePeriod,
} from '@ynab-counter/app-core/storage';
import type {
  AppSettings,
  CreditCard,
  DashboardTransactionsCacheEntry,
  RewardCalculation,
} from '@ynab-counter/app-core/storage';

export type LocalFlagUpdatePublication = {
  cacheEntry: DashboardTransactionsCacheEntry;
  calculations: RewardCalculation[];
};

/**
 * Publishes calculations from an already-updated complete cache. Demo mode
 * uses this instead of its fixture-resetting simulated network sync.
 */
export function createLocalFlagUpdatePublication({
  cacheEntry,
  cards,
  settings,
  calculations,
  now = new Date(),
}: {
  cacheEntry: DashboardTransactionsCacheEntry;
  cards: CreditCard[];
  settings: AppSettings;
  calculations: RewardCalculation[];
  now?: Date;
}): LocalFlagUpdatePublication {
  const currentPeriods = new Map<string, { start: string; end: string }>();
  const replacements = cards.map((card) => {
    const period = SimpleRewardsCalculator.calculatePeriod(card, now);
    currentPeriods.set(card.id, period);
    const currentCalculations = calculations.filter((calculation) => {
      if (calculation.cardId !== card.id) return false;
      const currentPeriod = normalizePeriod(calculation.period);
      return currentPeriod.start === period.start && currentPeriod.end === period.end;
    });
    const calculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      cacheEntry.transactions.filter(
        (transaction) => transaction.account_id === card.ynabAccountId,
      ),
      period,
      settings,
    );
    const canonicalRuleId = `card-${card.id}`;
    const ruleId = currentCalculations.some((current) => current.ruleId === canonicalRuleId)
      ? canonicalRuleId
      : currentCalculations.length === 1
        ? currentCalculations[0].ruleId
        : canonicalRuleId;

    return {
      ...createRewardCalculationFromSimple(card, calculation, ruleId),
      period: formatCalculationPeriod(period),
    };
  });

  const historicalCalculations = calculations.filter((calculation) => {
    const currentPeriod = currentPeriods.get(calculation.cardId);
    if (!currentPeriod) return true;
    const calculationPeriod = normalizePeriod(calculation.period);
    return calculationPeriod.start !== currentPeriod.start
      || calculationPeriod.end !== currentPeriod.end;
  });

  return {
    cacheEntry,
    calculations: [...historicalCalculations, ...replacements],
  };
}
