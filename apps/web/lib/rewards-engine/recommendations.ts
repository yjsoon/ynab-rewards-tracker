/**
 * Smart recommendations for card usage
 */

import type { RewardCalculation, CreditCard, RewardRule, AppSettings } from '@/lib/storage';

export interface CardRecommendation {
  cardId: string;
  cardName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  action: 'use' | 'avoid' | 'consider';
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
