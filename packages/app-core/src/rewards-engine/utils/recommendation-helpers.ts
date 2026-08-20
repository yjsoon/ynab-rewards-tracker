import { normalizePeriod } from '../../storage/helpers';
import type { CreditCard, RewardCalculation } from '../../storage/types';

import type { CategoryCardInsight } from '../types';
import { SimpleRewardsCalculator } from '../simple-calculator';
import { isSpendingTierCalculationCompatible } from './spending-tiers';

export const STATUS_PRIORITY: Record<CategoryCardInsight['status'], number> = {
  use: 3,
  consider: 2,
  avoid: 1,
};

/** Select at most one calculation for each card's exact current reward period. */
export function selectCurrentCardCalculations(
  cards: readonly CreditCard[],
  calculations: readonly RewardCalculation[],
  referenceDate = new Date(),
): RewardCalculation[] {
  const selected: RewardCalculation[] = [];

  for (const card of cards) {
    const period = SimpleRewardsCalculator.calculatePeriod(card, referenceDate);
    const matches = calculations.filter((calculation) => {
      if (
        calculation.cardId !== card.id ||
        !isSpendingTierCalculationCompatible(card, calculation)
      ) {
        return false;
      }
      const normalized = normalizePeriod(calculation.period);
      return (
        normalized.start === period.start && normalized.end === period.end
      ) || calculation.period === period.label;
    });
    const cardCalculation = matches.find(
      ({ ruleId }) => ruleId === `card-${card.id}`,
    ) ?? matches[matches.length - 1];
    if (cardCalculation) {
      selected.push(cardCalculation);
    }
  }

  return selected;
}

export function resolveLatestPeriod(calculations: RewardCalculation[]): string | undefined {
  return calculations.reduce<string | undefined>((latest, calc) => {
    if (!latest) {
      return calc.period;
    }
    return calc.period > latest ? calc.period : latest;
  }, undefined);
}

export function mapLatestSubcategoryCalculations(calculations: RewardCalculation[]): {
  latestPeriod?: string;
  byCard: Map<string, RewardCalculation>;
} {
  const byCard = new Map<string, RewardCalculation>();

  calculations.forEach((calc) => {
    if (!calc.subcategoryBreakdowns || calc.subcategoryBreakdowns.length === 0) {
      return;
    }

    const existing = byCard.get(calc.cardId);
    const normalized = normalizePeriod(calc.period);
    const existingPeriod = existing ? normalizePeriod(existing.period) : null;
    if (
      !existingPeriod ||
      normalized.end > existingPeriod.end ||
      (normalized.end === existingPeriod.end && normalized.start >= existingPeriod.start)
    ) {
      byCard.set(calc.cardId, calc);
    }
  });

  const selectedPeriods = new Set([...byCard.values()].map(({ period }) => period));
  const latestPeriod = selectedPeriods.size === 1
    ? selectedPeriods.values().next().value
    : undefined;
  return { latestPeriod, byCard };
}

export function sortCategoryInsights(insights: CategoryCardInsight[]): CategoryCardInsight[] {
  return [...insights].sort((a, b) => {
    const statusDiff = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (b.rewardRate !== a.rewardRate) {
      return b.rewardRate - a.rewardRate;
    }

    return b.rewardEarnedDollars - a.rewardEarnedDollars;
  });
}
