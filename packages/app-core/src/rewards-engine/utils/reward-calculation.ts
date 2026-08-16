import type { RewardCalculation, CreditCard, SubcategoryBreakdown } from '../../storage/types';

import type { SimplifiedCalculation, SubcategoryCalculation } from '../simple-calculator';
import { resolveCardSpendingTier } from './spending-tiers';

/**
 * Recomputes the dollar-denominated fields that depend only on the user's
 * current miles valuation. Raw miles and cashback calculations stay intact.
 */
export function revalueRewardCalculations(
  calculations: readonly RewardCalculation[],
  milesValuation: number,
): RewardCalculation[] {
  return calculations.map((calculation) => {
    if (calculation.rewardType !== 'miles') {
      return { ...calculation };
    }

    return {
      ...calculation,
      rewardEarnedDollars: calculation.rewardEarned * milesValuation,
      categoryBreakdowns: calculation.categoryBreakdowns?.map((breakdown) => ({
        ...breakdown,
        rewardDollars: breakdown.reward * milesValuation,
      })),
      subcategoryBreakdowns: calculation.subcategoryBreakdowns?.map((breakdown) => ({
        ...breakdown,
        rewardEarnedDollars: breakdown.rewardEarned * milesValuation,
      })),
    };
  });
}

function mapSubcategoryBreakdown(subcategory: SubcategoryCalculation): SubcategoryBreakdown {
  return {
    subcategoryId: subcategory.id,
    name: subcategory.name,
    flagColor: subcategory.flagColor,
    totalSpend: subcategory.totalSpend,
    countedSpend: subcategory.countedSpend,
    eligibleSpend: subcategory.eligibleSpend,
    eligibleSpendBeforeBlocks: subcategory.eligibleSpendBeforeBlocks,
    rewardEarned: subcategory.rewardEarned,
    rewardEarnedDollars: subcategory.rewardEarnedDollars,
    rewardRate: subcategory.rewardRate,
    minimumSpend: subcategory.minimumSpend,
    minimumSpendMet: subcategory.minimumSpendMet,
    maximumSpend: subcategory.maximumSpend,
    maximumSpendExceeded: subcategory.maximumSpendExceeded,
    blockSize: subcategory.blockSize,
    blocksEarned: subcategory.blocksEarned,
  };
}

export function createRewardCalculationFromSimple(
  card: CreditCard,
  calculation: SimplifiedCalculation,
  overrideRuleId?: string
): RewardCalculation {
  const hasHigherSpendingLevel = resolveCardSpendingTier(
    card,
    calculation.totalSpend,
  ).hasNextSpendingTier;

  return {
    cardId: card.id,
    ruleId: overrideRuleId ?? `card-${card.id}`,
    period: calculation.period,
    totalSpend: calculation.totalSpend,
    countedSpend: calculation.countedSpend,
    eligibleSpend: calculation.eligibleSpend,
    eligibleSpendBeforeBlocks: calculation.eligibleSpendBeforeBlocks,
    rewardEarned: calculation.rewardEarned,
    rewardEarnedDollars: calculation.rewardEarnedDollars,
    rewardType: calculation.rewardType,
    minimumSpend: calculation.minimumSpend,
    minimumProgress: calculation.minimumSpendProgress,
    maximumSpend: calculation.maximumSpend,
    maximumProgress: calculation.maximumSpendProgress,
    activeSpendingTierId: calculation.activeSpendingTierId,
    minimumMet: calculation.minimumSpendMet,
    maximumExceeded: calculation.maximumSpendExceeded,
    shouldStopUsing: calculation.maximumSpendExceeded && !hasHigherSpendingLevel,
    subcategoryBreakdowns: calculation.subcategoryBreakdowns?.map(mapSubcategoryBreakdown),
  };
}
