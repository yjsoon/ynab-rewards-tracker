/**
 * Smart recommendations for card usage
 */

import type {
  RewardCalculation,
  CreditCard,
  AppSettings,
  ThemeGroup,
  SubcategoryBreakdown,
  CardSubcategory,
  SubcategoryReference,
} from '@/lib/storage';

export interface CardRecommendation {
  cardId: string;
  cardName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  action: 'use' | 'avoid' | 'consider';
}

export interface CategoryCardInsight {
  cardId: string;
  cardName: string;
  cardType: CreditCard['type'];
  rewardRate: number;
  rewardEarnedDollars: number;
  totalSpend: number;
  eligibleSpend: number;
  eligibleSpendBeforeBlocks: number;
  hasData: boolean;
  minimumMet: boolean;
  minimumProgress?: number | null;
  minimumTarget?: number | null;
  minimumRemaining?: number | null;
  cardMinimumMet: boolean;
  cardMinimumProgress?: number | null;
  maximumCap?: number | null;
  maximumProgress?: number | null;
  headroomToMaximum?: number | null;
  cardMaximumProgress?: number | null;
  cardMaximumCap?: number | null;
  cardMaximumExceeded: boolean;
  status: 'use' | 'consider' | 'avoid';
  shouldAvoid: boolean;
  notes?: string[];
}

export interface CategoryRecommendation {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  latestPeriod?: string;
  insights: CategoryCardInsight[];
}

export class RecommendationEngine {
  /**
   * Generate card usage recommendations based on current calculations
   */
  static generateCardRecommendations(
    cards: CreditCard[],
    calculations: RewardCalculation[]
  ): CardRecommendation[] {
    const recommendations: CardRecommendation[] = [];

    cards.forEach(card => {
      const cardCalculations = calculations.filter(calc => calc.cardId === card.id);
      
      if (cardCalculations.length === 0) {
        recommendations.push({
          cardId: card.id,
          cardName: card.name,
          reason: 'No activity this period',
          priority: 'low',
          action: 'consider'
        });
        return;
      }

      // Check for cards that should be avoided
      const shouldAvoid = cardCalculations.some(calc => calc.shouldStopUsing);
      if (shouldAvoid) {
        recommendations.push({
          cardId: card.id,
          cardName: card.name,
          reason: 'Maximum spending limit reached',
          priority: 'high',
          action: 'avoid'
        });
        return;
      }

      // Check for cards close to minimum requirements
      const needsMoreSpend = cardCalculations.some(calc => 
        calc.minimumProgress !== undefined && 
        calc.minimumProgress < 100 && 
        calc.minimumProgress > 50
      );

      if (needsMoreSpend) {
        recommendations.push({
          cardId: card.id,
          cardName: card.name,
          reason: 'Close to meeting minimum spend requirement',
          priority: 'medium',
          action: 'use'
        });
        return;
      }

      // Check for cards with good reward rates using normalized dollar values
      const avgRewardRate = cardCalculations.reduce((sum, calc) => {
        // Use normalized dollars for consistent comparison across card types
        const rewardDollars = calc.rewardEarnedDollars || calc.rewardEarned;
        return sum + (calc.eligibleSpend > 0 ? rewardDollars / calc.eligibleSpend : 0);
      }, 0) / cardCalculations.length;

      if (avgRewardRate > 0.02) { // >2% effective rate
        recommendations.push({
          cardId: card.id,
          cardName: card.name,
          reason: `Good reward rate (${(avgRewardRate * 100).toFixed(1)}%)`,
          priority: 'medium',
          action: 'use'
        });
      }
    });

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return recommendations.sort((a, b) => 
      priorityOrder[b.priority] - priorityOrder[a.priority]
    );
  }

  static generateCategoryRecommendations(
    cards: CreditCard[],
    calculations: RewardCalculation[],
    groups: ThemeGroup[],
    settings?: AppSettings
  ): CategoryRecommendation[] {
    if (!groups || groups.length === 0) {
      return [];
    }

    const cardMap = new Map<string, CreditCard>();
    cards.forEach((card) => {
      cardMap.set(card.id, card);
    });

    const latestPeriod = calculations.reduce<string | undefined>((latest, calc) => {
      if (!latest) {
        return calc.period;
      }
      return calc.period > latest ? calc.period : latest;
    }, undefined);

    const relevantCalcs = latestPeriod
      ? calculations.filter((calc) => calc.period === latestPeriod)
      : calculations;

    const calcByCard = new Map<string, RewardCalculation>();
    relevantCalcs.forEach((calc) => {
      if (!calc.subcategoryBreakdowns || calc.subcategoryBreakdowns.length === 0) {
        return;
      }
      const existing = calcByCard.get(calc.cardId);
      if (!existing || calc.period >= existing.period) {
        calcByCard.set(calc.cardId, calc);
      }
    });

    const milesValuation = settings?.milesValuation ?? 0.01;
    const statusPriority = { use: 3, consider: 2, avoid: 1 } as const;

    return [...groups]
      .sort((a, b) => a.priority - b.priority)
      .map((group) => {
        const cardEntries = new Map<string, { refs: SubcategoryReference[]; includeWhole: boolean }>();

        group.subcategories.forEach((ref) => {
          if (!ref?.cardId || !ref?.subcategoryId) {
            return;
          }
          const entry = cardEntries.get(ref.cardId);
          if (entry) {
            entry.refs.push(ref);
          } else {
            cardEntries.set(ref.cardId, { refs: [ref], includeWhole: false });
          }
        });

        (group.cards ?? []).forEach((ref) => {
          if (!ref?.cardId) {
            return;
          }
          const entry = cardEntries.get(ref.cardId);
          if (entry) {
            if (entry.refs.length === 0) {
              entry.includeWhole = true;
            }
          } else {
            cardEntries.set(ref.cardId, { refs: [], includeWhole: true });
          }
        });

        const buildCardInsight = (card: CreditCard, calculation: RewardCalculation | undefined): CategoryCardInsight => {
          const totalSpend = calculation?.totalSpend ?? 0;
          const eligibleSpend = calculation?.eligibleSpend ?? 0;
          const eligibleSpendBeforeBlocks = calculation?.eligibleSpend ?? eligibleSpend;

          let rewardEarnedDollars = calculation?.rewardEarnedDollars;
          if (rewardEarnedDollars == null && calculation) {
            rewardEarnedDollars = calculation.rewardType === 'cashback'
              ? calculation.rewardEarned
              : (calculation.rewardEarned ?? 0) * milesValuation;
          }
          rewardEarnedDollars = rewardEarnedDollars ?? 0;

          const minimumTarget = typeof card.minimumSpend === 'number' && card.minimumSpend > 0
            ? card.minimumSpend
            : null;
          const cardMinimumProgress = calculation?.minimumProgress ?? (minimumTarget
            ? Math.min(100, (totalSpend / minimumTarget) * 100)
            : null);
          const minimumRemaining = minimumTarget ? Math.max(0, minimumTarget - totalSpend) : null;
          const cardMinimumMet = calculation?.minimumMet ?? (minimumTarget ? totalSpend >= minimumTarget : true);

          const maximumCap = typeof card.maximumSpend === 'number' && card.maximumSpend > 0
            ? card.maximumSpend
            : null;
          const spentTowardsCap = calculation?.eligibleSpend ?? eligibleSpend;
          const cardMaximumProgress = calculation?.maximumProgress ?? (maximumCap
            ? Math.min(100, (spentTowardsCap / maximumCap) * 100)
            : null);
          const headroomToMaximum = maximumCap ? Math.max(0, maximumCap - spentTowardsCap) : null;
          const cardMaximumExceeded = calculation?.maximumExceeded ?? Boolean(maximumCap && headroomToMaximum !== null && headroomToMaximum <= 0);

          const hasData = totalSpend > 0 || eligibleSpend > 0;

          const fallbackRate = card.type === 'cashback'
            ? ((card.earningRate ?? 0) / 100)
            : ((card.earningRate ?? 0) * milesValuation);

          const rewardRate = totalSpend > 0
            ? rewardEarnedDollars / totalSpend
            : fallbackRate;

          const shouldAvoid = Boolean(calculation?.shouldStopUsing) || cardMaximumExceeded;
          const status: 'use' | 'consider' | 'avoid' = shouldAvoid
            ? 'avoid'
            : (!cardMinimumMet ? 'consider' : 'use');

          return {
            cardId: card.id,
            cardName: card.name,
            cardType: card.type,
            rewardRate,
            rewardEarnedDollars,
            totalSpend,
            eligibleSpend,
            eligibleSpendBeforeBlocks,
            hasData,
            minimumMet: cardMinimumMet,
            minimumProgress: cardMinimumProgress,
            minimumTarget,
            minimumRemaining,
            cardMinimumMet,
            cardMinimumProgress,
            maximumCap,
            maximumProgress: cardMaximumProgress,
            headroomToMaximum,
            cardMaximumProgress,
            cardMaximumCap: maximumCap,
            cardMaximumExceeded,
            status,
            shouldAvoid,
          };
        };

        const insights: CategoryCardInsight[] = [];

        cardEntries.forEach((entry, cardId) => {
          const card = cardMap.get(cardId);
          if (!card) {
            return;
          }

          if (entry.refs.length === 0 && entry.includeWhole) {
            insights.push(buildCardInsight(card, calcByCard.get(cardId)));
            return;
          }

          if (entry.refs.length === 0) {
            return;
          }

          const cardSubcategories = Array.isArray(card.subcategories) ? card.subcategories : [];
          if (!card.subcategoriesEnabled || cardSubcategories.length === 0) {
            if (entry.includeWhole) {
              insights.push(buildCardInsight(card, calcByCard.get(cardId)));
            }
            return;
          }

          const subcategoryMap = new Map<string, CardSubcategory>();
          cardSubcategories.forEach((sub) => {
            if (sub && typeof sub.id === 'string') {
              subcategoryMap.set(sub.id, sub);
            }
          });

          const calculation = calcByCard.get(cardId);
          const breakdownMap = new Map<string, SubcategoryBreakdown>();
          calculation?.subcategoryBreakdowns?.forEach((breakdown) => {
            breakdownMap.set(breakdown.subcategoryId, breakdown);
          });

          let totalSpend = 0;
          let eligibleSpend = 0;
          let eligibleBeforeBlocksTotal = 0;
          let rewardEarnedDollars = 0;

          let minimumTargetSum = 0;
          let minimumProgressNumerator = 0;
          let minimumRemainingTotal = 0;

          let maximumCapSum = 0;
          let maximumProgressNumerator = 0;
          let minHeadroom = Number.POSITIVE_INFINITY;
          let hasMaximumConstraint = false;
          let maxExceeded = false;

          let hasData = false;

          entry.refs.forEach((ref) => {
            const subDefinition = subcategoryMap.get(ref.subcategoryId);
            if (!subDefinition || subDefinition.active === false || subDefinition.excludeFromRewards) {
              return;
            }
            const breakdown = breakdownMap.get(ref.subcategoryId);
            const spend = breakdown?.totalSpend ?? 0;
            const eligible = breakdown?.eligibleSpend ?? 0;
            const eligibleBefore = breakdown?.eligibleSpendBeforeBlocks ?? eligible;
            const rewardDollars = breakdown?.rewardEarnedDollars ??
              (card.type === 'cashback'
                ? breakdown?.rewardEarned ?? 0
                : (breakdown?.rewardEarned ?? 0) * milesValuation);

            if (spend > 0 || eligible > 0) {
              hasData = true;
            }

            totalSpend += spend;
            eligibleSpend += eligible;
            eligibleBeforeBlocksTotal += eligibleBefore;
            rewardEarnedDollars += rewardDollars;

            const minRequirement = typeof subDefinition.minimumSpend === 'number' ? subDefinition.minimumSpend : null;
            if (minRequirement && minRequirement > 0) {
              minimumTargetSum += minRequirement;
              const cappedSpend = Math.min(spend, minRequirement);
              minimumProgressNumerator += cappedSpend;
              if (spend < minRequirement) {
                minimumRemainingTotal += minRequirement - spend;
              }
            }

            const maxConstraint = typeof subDefinition.maximumSpend === 'number' ? subDefinition.maximumSpend : null;
            if (maxConstraint && maxConstraint > 0) {
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
          }

          if (headroomToMaximum !== null && headroomToMaximum <= 0) {
            maxExceeded = true;
          }

          const cardMinimumMet = calculation
            ? calculation.minimumMet
            : (typeof card.minimumSpend !== 'number' || card.minimumSpend <= 0);
          const cardMinimumProgress = calculation?.minimumProgress ?? null;

          const cardMaximumCap = typeof card.maximumSpend === 'number' && card.maximumSpend > 0
            ? card.maximumSpend
            : null;
          const cardMaximumProgress = calculation?.maximumProgress ?? null;
          const cardMaximumExceeded = calculation?.maximumExceeded ?? false;

          const shouldAvoid = Boolean(calculation?.shouldStopUsing) || maxExceeded || cardMaximumExceeded;
          const status: 'use' | 'consider' | 'avoid' = shouldAvoid
            ? 'avoid'
            : (!minimumMet || !cardMinimumMet ? 'consider' : 'use');

          const fallbackRate = card.type === 'cashback'
            ? ((card.earningRate ?? 0) / 100)
            : ((card.earningRate ?? 0) * milesValuation);

          const rewardRate = totalSpend > 0
            ? rewardEarnedDollars / totalSpend
            : fallbackRate;

          insights.push({
            cardId,
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
            minimumTarget: minimumTargetSum > 0 ? minimumTargetSum : null,
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
          });
        });

        insights.sort((a, b) => {
          const statusDiff = statusPriority[b.status] - statusPriority[a.status];
          if (statusDiff !== 0) return statusDiff;
          if (b.rewardRate !== a.rewardRate) return b.rewardRate - a.rewardRate;
          return b.rewardEarnedDollars - a.rewardEarnedDollars;
        });

        return {
          groupId: group.id,
          groupName: group.name,
          groupDescription: group.description,
          latestPeriod,
          insights,
        };
      })
      .filter((rec) => rec.insights.length > 0);
  }

  /**
   * Generate alerts for immediate attention
   */
  static generateAlerts(
    cards: CreditCard[],
    calculations: RewardCalculation[]
  ): CardRecommendation[] {
    const alerts: CardRecommendation[] = [];

    calculations.forEach(calc => {
      const card = cards.find(c => c.id === calc.cardId);
      if (!card) return;

      // Alert for maximum reached
      if (calc.shouldStopUsing) {
        alerts.push({
          cardId: card.id,
          cardName: card.name,
          reason: 'Stop using - maximum spend reached',
          priority: 'high',
          action: 'avoid'
        });
      }

      // Alert for minimum not met (with deadline approaching)
      if (calc.minimumProgress !== undefined && calc.minimumProgress < 80) {
        alerts.push({
          cardId: card.id,
          cardName: card.name,
          reason: `Only ${Math.round(calc.minimumProgress)}% of minimum spend`,
          priority: 'medium',
          action: 'use'
        });
      }
    });

    return alerts;
  }
}
