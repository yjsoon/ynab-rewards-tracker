/**
 * Smart recommendations for card usage
 */

import type { RewardCalculation, CreditCard, AppSettings, ThemeGroup } from '@/lib/storage';

import type { CardRecommendation, CategoryCardInsight, CategoryRecommendation } from './types';
import { buildCardEntries, createSubcategoryInsight, createWholeCardInsight } from './utils/category-insights';

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
