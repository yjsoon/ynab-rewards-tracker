import type {
  CardSubcategory,
  CreditCard,
  RewardCalculation,
  SubcategoryBreakdown,
  SubcategoryReference,
  ThemeGroup,
} from '../../storage/types';

import type { CategoryCardInsight } from '../types';

export interface GroupCardEntry {
  refs: SubcategoryReference[];
  includeWhole: boolean;
}

export function buildCardEntries(group: ThemeGroup): Map<string, GroupCardEntry> {
  const entries = new Map<string, GroupCardEntry>();

  (group.subcategories ?? []).forEach((ref) => {
    if (!ref?.cardId || !ref?.subcategoryId) {
      return;
    }

    const existing = entries.get(ref.cardId);
    if (existing) {
      existing.refs.push(ref);
    } else {
      entries.set(ref.cardId, { refs: [ref], includeWhole: false });
    }
  });

  (group.cards ?? []).forEach((ref) => {
    if (!ref?.cardId) {
      return;
    }

    const existing = entries.get(ref.cardId);
    if (existing) {
      if (existing.refs.length === 0) {
        existing.includeWhole = true;
      }
    } else {
      entries.set(ref.cardId, { refs: [], includeWhole: true });
    }
  });

  return entries;
}

export function createWholeCardInsight(
  card: CreditCard,
  calculation: RewardCalculation | undefined,
  milesValuation: number
): CategoryCardInsight {
  const totalSpend = calculation?.totalSpend ?? 0;
  const eligibleSpend = calculation?.eligibleSpend ?? 0;
  const eligibleBeforeBlocks = calculation?.eligibleSpend ?? eligibleSpend;
  const rewardEarnedDollars = resolveRewardDollars(calculation, card.type, milesValuation);

  const fallbackRate = computeFallbackRate(card, milesValuation);
  const rewardRate = totalSpend > 0 ? rewardEarnedDollars / totalSpend : fallbackRate;

  const minimumTarget = getPositiveNumber(card.minimumSpend);
  const minimumProgress = calculation?.minimumProgress ?? (minimumTarget
    ? Math.min(100, (totalSpend / minimumTarget) * 100)
    : null);
  const minimumRemaining = minimumTarget ? Math.max(0, minimumTarget - totalSpend) : null;
  const minimumMet = calculation?.minimumMet ?? (minimumTarget ? totalSpend >= minimumTarget : true);

  const maximumCap = getPositiveNumber(card.maximumSpend);
  const maximumProgress = calculation?.maximumProgress ?? (maximumCap
    ? Math.min(100, (eligibleBeforeBlocks / maximumCap) * 100)
    : null);
  const headroomToMaximum = maximumCap ? Math.max(0, maximumCap - eligibleBeforeBlocks) : null;
  const maximumExceeded = calculation?.maximumExceeded ?? Boolean(maximumCap && headroomToMaximum !== null && headroomToMaximum <= 0);

  const shouldAvoid = Boolean(calculation?.shouldStopUsing) || maximumExceeded;
  const status: CategoryCardInsight['status'] = shouldAvoid
    ? 'avoid'
    : (minimumMet ? 'use' : 'consider');

  return {
    cardId: card.id,
    cardName: card.name,
    cardType: card.type,
    rewardRate,
    rewardEarnedDollars,
    totalSpend,
    eligibleSpend,
    eligibleSpendBeforeBlocks: eligibleBeforeBlocks,
    hasData: totalSpend > 0 || eligibleSpend > 0,
    minimumMet,
    minimumProgress,
    minimumTarget,
    minimumRemaining,
    cardMinimumMet: minimumMet,
    cardMinimumProgress: minimumProgress,
    maximumCap,
    maximumProgress,
    headroomToMaximum,
    cardMaximumProgress: maximumProgress,
    cardMaximumCap: maximumCap,
    cardMaximumExceeded: maximumExceeded,
    status,
    shouldAvoid,
  };
}

export function createSubcategoryInsight(
  card: CreditCard,
  calculation: RewardCalculation | undefined,
  refs: SubcategoryReference[],
  milesValuation: number
): CategoryCardInsight | null {
  if (refs.length === 0) {
    return null;
  }

  if (!card.subcategoriesEnabled) {
    return null;
  }

  const cardSubcategories = Array.isArray(card.subcategories) ? card.subcategories : [];
  if (cardSubcategories.length === 0) {
    return null;
  }

  const subcategoryMap = new Map<string, CardSubcategory>();
  cardSubcategories.forEach((subcategory) => {
    if (subcategory && typeof subcategory.id === 'string') {
      subcategoryMap.set(subcategory.id, subcategory);
    }
  });

  const breakdownMap = new Map<string, SubcategoryBreakdown>();
  calculation?.subcategoryBreakdowns?.forEach((breakdown) => {
    if (breakdown?.subcategoryId) {
      breakdownMap.set(breakdown.subcategoryId, breakdown);
    }
  });

  let totalSpend = 0;
  let eligibleSpend = 0;
  let eligibleBeforeBlocksTotal = 0;
  let rewardEarnedDollars = 0;

  let minimumTargetSum = 0;
  let minimumProgressNumerator = 0;
  let minimumRemainingTotal = 0;

  let hasMaximumConstraint = false;
  let maximumCapSum = 0;
  let maximumProgressNumerator = 0;
  let minHeadroom = Number.POSITIVE_INFINITY;
  let maxExceeded = false;

  let hasData = false;

  refs.forEach((ref) => {
    if (!ref?.cardId || !ref?.subcategoryId) {
      return;
    }

    const subDefinition = subcategoryMap.get(ref.subcategoryId);
    if (!subDefinition || subDefinition.active === false || subDefinition.excludeFromRewards) {
      return;
    }

    const breakdown = breakdownMap.get(ref.subcategoryId);
    const spend = breakdown?.totalSpend ?? 0;
    const eligible = breakdown?.eligibleSpend ?? 0;
    const eligibleBefore = breakdown?.eligibleSpendBeforeBlocks ?? eligible;
    const rewardDollars = resolveBreakdownRewardDollars(breakdown, card.type, milesValuation);

    if (spend > 0 || eligible > 0) {
      hasData = true;
    }

    totalSpend += spend;
    eligibleSpend += eligible;
    eligibleBeforeBlocksTotal += eligibleBefore;
    rewardEarnedDollars += rewardDollars;

    const minRequirement = getPositiveNumber(subDefinition.minimumSpend);
    if (minRequirement) {
      minimumTargetSum += minRequirement;
      const cappedSpend = Math.min(spend, minRequirement);
      minimumProgressNumerator += cappedSpend;
      if (spend < minRequirement) {
        minimumRemainingTotal += minRequirement - spend;
      }
    }

    const maxConstraint = getPositiveNumber(subDefinition.maximumSpend);
    if (maxConstraint) {
      hasMaximumConstraint = true;
      maximumCapSum += maxConstraint;
      const cappedEligible = Math.min(eligibleBefore, maxConstraint);
      maximumProgressNumerator += cappedEligible;
      const remaining = Math.max(0, maxConstraint - eligibleBefore);
      if (remaining < minHeadroom) {
        minHeadroom = remaining;
      }
      if (eligibleBefore >= maxConstraint) {
        maxExceeded = true;
      }
    }
  });

  const minimumProgress = minimumTargetSum > 0
    ? Math.min(100, (minimumProgressNumerator / minimumTargetSum) * 100)
    : null;
  const minimumRemaining = minimumTargetSum > 0 ? Math.max(0, minimumRemainingTotal) : null;
  const minimumMet = minimumRemaining === null || minimumRemaining <= 0.0001;

  const maximumProgress = hasMaximumConstraint && maximumCapSum > 0
    ? Math.min(100, (maximumProgressNumerator / maximumCapSum) * 100)
    : null;

  let headroomToMaximum: number | null = null;
  if (hasMaximumConstraint) {
    if (minHeadroom === Number.POSITIVE_INFINITY) {
      headroomToMaximum = Math.max(0, maximumCapSum - maximumProgressNumerator);
    } else {
      headroomToMaximum = Math.max(0, minHeadroom);
    }

    if (headroomToMaximum <= 0) {
      maxExceeded = true;
    }
  }

  const minimumTarget = minimumTargetSum > 0 ? minimumTargetSum : null;

  const cardMinimumMet = calculation
    ? calculation.minimumMet
    : (typeof card.minimumSpend !== 'number' || card.minimumSpend <= 0);
  const cardMinimumProgress = calculation?.minimumProgress ?? null;

  const cardMaximumCap = getPositiveNumber(card.maximumSpend);
  const cardMaximumProgress = calculation?.maximumProgress ?? null;
  const cardMaximumExceeded = calculation?.maximumExceeded ?? false;

  const shouldAvoid = Boolean(calculation?.shouldStopUsing) || maxExceeded || cardMaximumExceeded;
  const fallbackRate = computeFallbackRate(card, milesValuation);
  const rewardRate = totalSpend > 0 ? rewardEarnedDollars / totalSpend : fallbackRate;

  const status: CategoryCardInsight['status'] = shouldAvoid
    ? 'avoid'
    : (!minimumMet || !cardMinimumMet ? 'consider' : 'use');

  return {
    cardId: card.id,
    cardName: card.name,
    cardType: card.type,
    rewardRate,
    rewardEarnedDollars,
    totalSpend,
    eligibleSpend,
    eligibleSpendBeforeBlocks: eligibleBeforeBlocksTotal,
    hasData,
    minimumMet,
    minimumProgress,
    minimumTarget,
    minimumRemaining,
    cardMinimumMet,
    cardMinimumProgress,
    maximumCap: hasMaximumConstraint ? maximumCapSum : null,
    maximumProgress,
    headroomToMaximum,
    cardMaximumProgress,
    cardMaximumCap,
    cardMaximumExceeded,
    status,
    shouldAvoid,
  };
}

function resolveRewardDollars(
  calculation: RewardCalculation | undefined,
  cardType: CreditCard['type'],
  milesValuation: number
): number {
  if (!calculation) {
    return 0;
  }

  if (typeof calculation.rewardEarnedDollars === 'number') {
    return calculation.rewardEarnedDollars;
  }

  if (cardType === 'cashback') {
    return calculation.rewardEarned;
  }

  return calculation.rewardEarned * milesValuation;
}

function resolveBreakdownRewardDollars(
  breakdown: SubcategoryBreakdown | undefined,
  cardType: CreditCard['type'],
  milesValuation: number
): number {
  if (!breakdown) {
    return 0;
  }

  if (typeof breakdown.rewardEarnedDollars === 'number') {
    return breakdown.rewardEarnedDollars;
  }

  if (cardType === 'cashback') {
    return breakdown.rewardEarned ?? 0;
  }

  return (breakdown.rewardEarned ?? 0) * milesValuation;
}

function computeFallbackRate(card: CreditCard, milesValuation: number): number {
  if (card.type === 'cashback') {
    return ((card.earningRate ?? 0) / 100);
  }

  return (card.earningRate ?? 0) * milesValuation;
}

function getPositiveNumber(value: number | null | undefined): number | null {
  if (typeof value === 'number' && value > 0) {
    return value;
  }
  return null;
}