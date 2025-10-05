/**
 * Smart recommendations for card usage
 */

import type { RewardCalculation, CreditCard, AppSettings, ThemeGroup } from '@/lib/storage';

import type { CardRecommendation, CategoryCardInsight, CategoryRecommendation } from './types';
import { buildCardEntries, createSubcategoryInsight, createWholeCardInsight } from './utils/category-insights';
import { getAlertRecommendations, getCardRecommendations } from './utils/card-recommendations';
import { mapLatestSubcategoryCalculations, sortCategoryInsights } from './utils/recommendation-helpers';

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

    const { latestPeriod, byCard: calcByCard } = mapLatestSubcategoryCalculations(calculations);
    const milesValuation = settings?.milesValuation ?? 0.01;

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

        return {
          groupId: group.id,
          groupName: group.name,
          groupDescription: group.description,
          latestPeriod,
          insights: sortCategoryInsights(insights),
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
