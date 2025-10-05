import type { RewardCalculation, CreditCard, SubcategoryBreakdown } from '@/lib/storage';

import type { SimplifiedCalculation, SubcategoryCalculation } from '../simple-calculator';

function mapSubcategoryBreakdown(subcategory: SubcategoryCalculation): SubcategoryBreakdown {
  return {
    subcategoryId: subcategory.id,
    name: subcategory.name,
    flagColor: subcategory.flagColor,
    totalSpend: subcategory.totalSpend,
    eligibleSpend: subcategory.eligibleSpend,
    eligibleSpendBeforeBlocks: subcategory.eligibleSpendBeforeBlocks,
    rewardEarned: subcategory.rewardEarned,
    rewardEarnedDollars: subcategory.rewardEarnedDollars,
    minimumSpendMet: subcategory.minimumSpendMet,
    maximumSpendExceeded: subcategory.maximumSpendExceeded,
  };
}

export function createRewardCalculationFromSimple(
  card: CreditCard,
  calculation: SimplifiedCalculation,
  overrideRuleId?: string
): RewardCalculation {
  return {
    cardId: card.id,
    ruleId: overrideRuleId ?? `card-${card.id}`,
    period: calculation.period,
    totalSpend: calculation.totalSpend,
    eligibleSpend: calculation.eligibleSpend,
    rewardEarned: calculation.rewardEarned,
    rewardEarnedDollars: calculation.rewardEarnedDollars,
    rewardType: calculation.rewardType,
    minimumProgress: calculation.minimumSpendProgress,
    maximumProgress: calculation.maximumSpendProgress,
    minimumMet: calculation.minimumSpendMet,
    maximumExceeded: calculation.maximumSpendExceeded,
    shouldStopUsing: calculation.maximumSpendExceeded,
    subcategoryBreakdowns: calculation.subcategoryBreakdowns?.map(mapSubcategoryBreakdown),
  };
}
