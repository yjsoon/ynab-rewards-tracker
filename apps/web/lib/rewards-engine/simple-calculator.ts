/**
 * Simplified rewards calculation using card earning rates
 */

import type { CreditCard, AppSettings } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';
import {
  hasMinimumSpendRequirement,
  isMinimumSpendMet,
  calculateMinimumSpendProgress,
  isMaximumSpendExceeded,
  calculateMaximumSpendProgress
} from '@/lib/minimum-spend-helpers';

export interface SimplifiedCalculation {
  cardId: string;
  period: string;
  totalSpend: number;
  eligibleSpend: number; // Spend that actually earns rewards (after min/max limits)
  rewardEarned: number; // Raw reward units (dollars for cashback, miles for miles cards)
  rewardEarnedDollars: number; // Normalized dollar value for comparison
  rewardType: 'cashback' | 'miles';
  // Minimum spend tracking
  minimumSpend?: number | null; // Required spending threshold (null = not configured, 0 = no minimum, >0 = has minimum)
  minimumSpendMet: boolean; // Whether minimum spend requirement is satisfied
  minimumSpendProgress?: number; // Progress toward minimum (0-100) if applicable
  // Maximum spend tracking
  maximumSpend?: number | null; // Spending cap (null = not configured, 0 = no limit, >0 = has limit)
  maximumSpendExceeded: boolean; // Whether maximum spend limit has been exceeded
  maximumSpendProgress?: number; // Progress toward maximum (0-100) if applicable
}

export interface CalculationPeriod {
  start: string; // ISO date string
  end: string; // ISO date string
  label: string;
}

export class SimpleRewardsCalculator {
  /**
   * Calculate the current period for a card based on billing cycle
   */
  static calculatePeriod(card: CreditCard): CalculationPeriod {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (card.billingCycle?.type === 'billing' && card.billingCycle.dayOfMonth) {
      // Custom billing cycle
      const billingDay = card.billingCycle.dayOfMonth;
      let startDate: Date;
      let endDate: Date;

      if (now.getDate() >= billingDay) {
        // Current period started this month
        startDate = new Date(year, month, billingDay);
        endDate = new Date(year, month + 1, billingDay - 1, 23, 59, 59, 999);
      } else {
        // Current period started last month
        startDate = new Date(year, month - 1, billingDay);
        endDate = new Date(year, month, billingDay - 1, 23, 59, 59, 999);
      }

      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        label: `${startDate.toISOString().split('T')[0]}`
      };
    } else {
      // Calendar month
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

      return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        label: `${year}-${String(month + 1).padStart(2, '0')}`
      };
    }
  }

  /**
   * Calculate rewards for a card based on its earning rate
   */
  static calculateCardRewards(
    card: CreditCard,
    transactions: Transaction[],
    period: CalculationPeriod,
    settings?: AppSettings
  ): SimplifiedCalculation {
    // Get valuation rate from settings (default 1 cent per mile)
    const milesValuation = settings?.milesValuation || 0.01;

    // Filter transactions to this period
    const periodTransactions = transactions.filter(txn => {
      const txnDate = txn.date;
      return txnDate >= period.start && txnDate <= period.end && txn.amount < 0;
    });

    // Calculate total spend (convert from milliunits)
    const totalSpend = Math.abs(
      periodTransactions.reduce((sum, txn) => sum + txn.amount, 0)
    ) / 1000;

    // Calculate minimum spend progress and status
    const minimumSpend = card.minimumSpend;
    const minimumSpendMet = isMinimumSpendMet(totalSpend, minimumSpend);
    const minimumSpendProgress = calculateMinimumSpendProgress(totalSpend, minimumSpend);

    // Calculate maximum spend progress and status
    const maximumSpend = card.maximumSpend;
    const maximumSpendExceeded = isMaximumSpendExceeded(totalSpend, maximumSpend);
    const maximumSpendProgress = calculateMaximumSpendProgress(totalSpend, maximumSpend);

    // Calculate eligible spend (spend that earns rewards)
    let eligibleSpend = totalSpend;
    
    // If minimum spend not met, no spend is eligible
    if (!minimumSpendMet) {
      eligibleSpend = 0;
    }
    // If maximum spend exceeded, cap at the maximum
    else if (maximumSpendExceeded) {
      eligibleSpend = maximumSpend as number; // We know it's > 0 when exceeded
    }

    // Calculate rewards based on eligible spend only
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;

    // Only calculate rewards if we have eligible spend and an earning rate
    if (eligibleSpend > 0 && card.earningRate) {
      if (card.type === 'cashback') {
        // For cashback cards, earningRate is a percentage
        rewardEarned = eligibleSpend * (card.earningRate / 100);
        rewardEarnedDollars = rewardEarned;
      } else {
        // For miles cards, earningRate is miles per dollar
        rewardEarned = eligibleSpend * card.earningRate;
        // Convert miles to dollars using valuation
        rewardEarnedDollars = rewardEarned * milesValuation;
      }
    }

    return {
      cardId: card.id,
      period: period.label,
      totalSpend,
      eligibleSpend,
      rewardEarned,
      rewardEarnedDollars,
      rewardType: card.type,
      minimumSpend,
      minimumSpendMet,
      minimumSpendProgress,
      maximumSpend,
      maximumSpendExceeded,
      maximumSpendProgress
    };
  }

  /**
   * Calculate effective reward rate as a percentage
   */
  static calculateEffectiveRate(calculation: SimplifiedCalculation): number {
    if (calculation.totalSpend === 0) return 0;
    return (calculation.rewardEarnedDollars / calculation.totalSpend) * 100;
  }

  /**
   * Compare cards and find the best one for a given spending amount
   */
  static findBestCard(
    cards: CreditCard[],
    transactions: Transaction[],
    period: CalculationPeriod,
    settings?: AppSettings
  ): { card: CreditCard; calculation: SimplifiedCalculation } | null {
    const activeCards = cards.filter(c => c.active && c.earningRate);

    if (activeCards.length === 0) return null;

    let bestCard = activeCards[0];
    let bestCalculation = this.calculateCardRewards(bestCard, transactions, period, settings);

    for (const card of activeCards.slice(1)) {
      const calculation = this.calculateCardRewards(card, transactions, period, settings);
      if (calculation.rewardEarnedDollars > bestCalculation.rewardEarnedDollars) {
        bestCard = card;
        bestCalculation = calculation;
      }
    }

    return { card: bestCard, calculation: bestCalculation };
  }
}