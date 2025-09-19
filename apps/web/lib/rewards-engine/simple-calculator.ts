/**
 * Simplified rewards calculation using card earning rates
 */

import type { CreditCard, AppSettings } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';

export interface SimplifiedCalculation {
  cardId: string;
  period: string;
  totalSpend: number;
  rewardEarned: number; // Raw reward units (dollars for cashback, miles for miles cards)
  rewardEarnedDollars: number; // Normalized dollar value for comparison
  rewardType: 'cashback' | 'miles';
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

    // Calculate rewards based on card earning rate
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;

    if (card.earningRate) {
      if (card.type === 'cashback') {
        // For cashback cards, earningRate is a percentage
        rewardEarned = totalSpend * (card.earningRate / 100);
        rewardEarnedDollars = rewardEarned;
      } else {
        // For miles cards, earningRate is miles per dollar (or per block)
        if (card.milesBlockSize && card.milesBlockSize > 1) {
          // Calculate based on spending blocks
          const blocks = Math.floor(totalSpend / card.milesBlockSize);
          rewardEarned = blocks * card.earningRate;
        } else {
          // Simple miles per dollar
          rewardEarned = totalSpend * card.earningRate;
        }
        // Convert miles to dollars using valuation
        rewardEarnedDollars = rewardEarned * milesValuation;
      }
    }

    return {
      cardId: card.id,
      period: period.label,
      totalSpend,
      rewardEarned,
      rewardEarnedDollars,
      rewardType: card.type
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