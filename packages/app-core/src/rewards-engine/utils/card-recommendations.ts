import type { CreditCard, RewardCalculation } from '../../storage/types';

import type { CardRecommendation } from '../types';

const PRIORITY_ORDER: Record<CardRecommendation['priority'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const MINIMUM_PROGRESS_ATTENTION_THRESHOLD = 50;
export const MINIMUM_PROGRESS_ALERT_THRESHOLD = 80;
export const EFFECTIVE_RATE_GOOD_THRESHOLD = 0.02;

export function getCardRecommendations(
  cards: CreditCard[],
  calculations: RewardCalculation[]
): CardRecommendation[] {
  const recommendations: CardRecommendation[] = [];

  cards.forEach((card) => {
    const cardCalculations = calculations.filter((calc) => calc.cardId === card.id);

    if (cardCalculations.length === 0) {
      recommendations.push({
        cardId: card.id,
        cardName: card.name,
        reason: 'No activity this period',
        priority: 'low',
        action: 'consider',
      });
      return;
    }

    if (cardCalculations.some((calc) => calc.shouldStopUsing)) {
      recommendations.push({
        cardId: card.id,
        cardName: card.name,
        reason: 'Maximum spending limit reached',
        priority: 'high',
        action: 'avoid',
      });
      return;
    }

    const needsMoreSpend = cardCalculations.some((calc) => {
      if (typeof calc.minimumProgress !== 'number') {
        return false;
      }
      return calc.minimumProgress < 100 && calc.minimumProgress > MINIMUM_PROGRESS_ATTENTION_THRESHOLD;
    });

    if (needsMoreSpend) {
      recommendations.push({
        cardId: card.id,
        cardName: card.name,
        reason: 'Close to meeting minimum spend requirement',
        priority: 'medium',
        action: 'use',
      });
      return;
    }

    const avgRewardRate = averageEffectiveRewardRate(cardCalculations);
    if (avgRewardRate > EFFECTIVE_RATE_GOOD_THRESHOLD) {
      recommendations.push({
        cardId: card.id,
        cardName: card.name,
        reason: `Good reward rate (${(avgRewardRate * 100).toFixed(1)}%)`,
        priority: 'medium',
        action: 'use',
      });
    }
  });

  return recommendations.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
}

export function getAlertRecommendations(
  cards: CreditCard[],
  calculations: RewardCalculation[]
): CardRecommendation[] {
  const alerts: CardRecommendation[] = [];

  calculations.forEach((calc) => {
    const card = cards.find((c) => c.id === calc.cardId);
    if (!card) {
      return;
    }

    if (calc.shouldStopUsing) {
      alerts.push({
        cardId: card.id,
        cardName: card.name,
        reason: 'Stop using - maximum spend reached',
        priority: 'high',
        action: 'avoid',
      });
    }

    if (typeof calc.minimumProgress === 'number' && calc.minimumProgress < MINIMUM_PROGRESS_ALERT_THRESHOLD) {
      alerts.push({
        cardId: card.id,
        cardName: card.name,
        reason: `Only ${Math.round(calc.minimumProgress)}% of minimum spend`,
        priority: 'medium',
        action: 'use',
      });
    }
  });

  return alerts;
}

function averageEffectiveRewardRate(calculations: RewardCalculation[]): number {
  if (calculations.length === 0) {
    return 0;
  }

  const totalRate = calculations.reduce((sum, calc) => {
    if (calc.eligibleSpend <= 0) {
      return sum;
    }
    const rewardDollars = typeof calc.rewardEarnedDollars === 'number' ? calc.rewardEarnedDollars : calc.rewardEarned;
    return sum + rewardDollars / calc.eligibleSpend;
  }, 0);

  return totalRate / calculations.length;
}