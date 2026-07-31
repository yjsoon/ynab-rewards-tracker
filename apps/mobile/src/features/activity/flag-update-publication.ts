import { SimpleRewardsCalculator } from '@ynab-counter/app-core/rewards-engine';
import { createRewardCalculationFromSimple } from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';
import {
  formatCalculationPeriod,
  mergeRewardCalculations,
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
  const replacements = cards.map((card) => {
    const period = SimpleRewardsCalculator.calculatePeriod(card, now);
    const currentCalculation = calculations.find((calculation) => {
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
    return {
      ...createRewardCalculationFromSimple(card, calculation, currentCalculation?.ruleId),
      period: formatCalculationPeriod(period),
    };
  });

  return {
    cacheEntry,
    calculations: mergeRewardCalculations(calculations, replacements),
  };
}
