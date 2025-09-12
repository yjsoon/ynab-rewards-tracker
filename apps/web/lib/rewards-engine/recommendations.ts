/**
 * Smart recommendations for card usage
 */

import type { RewardCalculation, CreditCard, RewardRule } from '@/lib/storage';

export interface CardRecommendation {
  cardId: string;
  cardName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  action: 'use' | 'avoid' | 'consider';
}

export interface CategoryRecommendation {
  category: string;
  bestCardId: string;
  bestCardName: string;
  expectedReward: number;
  rewardType: 'cashback' | 'miles';
  reason: string;
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

      // Check for cards with good reward rates
      const avgRewardRate = cardCalculations.reduce((sum, calc) => {
        return sum + (calc.eligibleSpend > 0 ? calc.rewardEarned / calc.eligibleSpend : 0);
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
   * Recommend best card for each category
   */
  static generateCategoryRecommendations(
    cards: CreditCard[],
    rules: RewardRule[],
    calculations: RewardCalculation[]
  ): CategoryRecommendation[] {
    const categoryRecommendations: CategoryRecommendation[] = [];
    
    // Get all unique categories
    const categories = new Set<string>();
    rules.forEach(rule => {
      rule.categories.forEach(cat => categories.add(cat));
    });

    categories.forEach(category => {
      const eligibleRules = rules.filter(rule => 
        rule.categories.includes(category) && 
        rule.active
      );

      if (eligibleRules.length === 0) return;

      // Find best rule for this category
      let bestRule: RewardRule | null = null;
      let bestEffectiveRate = 0;

      eligibleRules.forEach(rule => {
        const card = cards.find(c => c.id === rule.cardId);
        if (!card || !card.active) return;

        // Check if rule is maxed out
        const calculation = calculations.find(calc => 
          calc.cardId === rule.cardId && 
          calc.ruleId === rule.id
        );

        if (calculation?.shouldStopUsing) return;

        // Calculate effective rate (accounting for caps and blocks)
        let effectiveRate = 0;
        if (rule.rewardType === 'cashback') {
          effectiveRate = rule.rewardValue / 100;
        } else if (rule.rewardType === 'miles') {
          if (rule.milesBlockSize) {
            // For block-based, assume average efficiency
            effectiveRate = rule.rewardValue * 0.8; // 80% efficiency assumption
          } else {
            effectiveRate = rule.rewardValue * 0.01; // Assume 1¢ per mile
          }
        }

        if (effectiveRate > bestEffectiveRate) {
          bestEffectiveRate = effectiveRate;
          bestRule = rule;
        }
      });

      if (bestRule) {
        const bestCard = cards.find(c => c.id === bestRule!.cardId)!;
        const calculation = calculations.find(calc => 
          calc.cardId === bestRule!.cardId && 
          calc.ruleId === bestRule!.id
        );

        let reason = `Best rate: ${bestRule.rewardType === 'cashback' 
          ? `${bestRule.rewardValue}%` 
          : `${bestRule.rewardValue}x miles`}`;

        if (calculation?.maximumProgress && calculation.maximumProgress > 80) {
          reason += ` (${Math.round(calculation.maximumProgress)}% of cap used)`;
        }

        categoryRecommendations.push({
          category,
          bestCardId: bestCard.id,
          bestCardName: bestCard.name,
          expectedReward: bestEffectiveRate * 100, // As percentage
          rewardType: bestRule.rewardType,
          reason
        });
      }
    });

    return categoryRecommendations.sort((a, b) => 
      a.category.localeCompare(b.category)
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