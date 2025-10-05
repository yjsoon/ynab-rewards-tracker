/**
 * Smart recommendations for card usage
 */

import type { RewardCalculation, CreditCard, AppSettings, ThemeGroup } from '@/lib/storage';

import type { CardRecommendation, CategoryCardInsight, CategoryRecommendation } from './types';
import { buildCardEntries, createSubcategoryInsight, createWholeCardInsight } from './utils/category-insights';
import { getAlertRecommendations, getCardRecommendations } from './utils/card-recommendations';

export class RecommendationEngine {
  /**
   * Generate card usage recommendations based on current calculations
   */
  static generateCardRecommendations(
    cards: CreditCard[],
    calculations: RewardCalculation[]
  ): CardRecommendation[] {
    return getCardRecommendations(cards, calculations);
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
        const cardEntries = buildCardEntries(group);

        const insights: CategoryCardInsight[] = [];

        cardEntries.forEach((entry, cardId) => {
          const card = cardMap.get(cardId);
          if (!card) {
            return;
          }

          const calculation = calcByCard.get(cardId);

          if (entry.refs.length === 0) {
            if (entry.includeWhole) {
              insights.push(createWholeCardInsight(card, calculation, milesValuation));
            }
            return;
          }

          const subcategoryInsight = createSubcategoryInsight(card, calculation, entry.refs, milesValuation);
          if (subcategoryInsight) {
            insights.push(subcategoryInsight);
            return;
          }

          if (entry.includeWhole) {
            insights.push(createWholeCardInsight(card, calculation, milesValuation));
          }
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
    return getAlertRecommendations(cards, calculations);
  }
}
