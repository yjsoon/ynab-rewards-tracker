/**
 * Core rewards calculation logic
 */

import type {
  RewardRule,
  CreditCard,
  RewardCalculation,
  AppSettings
} from '@/lib/storage';
import type { TransactionWithRewards } from '@/types/transaction';
import { getEffectiveBillingDay, parseYnabDate } from './date-utils';
export interface CalculationPeriod {
  startDate: Date;
  endDate: Date;
  name: string;
}

export class RewardsCalculator {
  /**
   * Calculate rewards for a single rule in a given period
   */
  static calculateRuleRewards(
    rule: RewardRule,
    transactions: TransactionWithRewards[],
    period: CalculationPeriod,
    settings?: AppSettings
  ): RewardCalculation {
    // Get valuation rates from settings (default 1 cent per mile/point)
    const milesValuation = settings?.milesValuation || 0.01;

    // Filter transactions to this period
    const eligibleTransactions = transactions.filter(txn => {
      const txnDate = parseYnabDate(txn.date);
      return txnDate >= period.startDate && txnDate <= period.endDate;
    });

    // Calculate total spend
    const totalSpend = Math.abs(
      eligibleTransactions.reduce((sum, txn) => sum + txn.amount, 0) / 1000
    );

    let eligibleSpend = totalSpend;
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;

    // Apply minimum spend requirement
    const minimumMet = !rule.minimumSpend || totalSpend >= rule.minimumSpend;
    const minimumProgress = rule.minimumSpend
      ? Math.min(100, (totalSpend / rule.minimumSpend) * 100)
      : 100;

    if (!minimumMet) {
      // No rewards if minimum not met
      eligibleSpend = 0;
      rewardEarned = 0;
      rewardEarnedDollars = 0;
    } else {
      // Apply maximum spend cap if applicable
      if (rule.maximumSpend && totalSpend > rule.maximumSpend) {
        eligibleSpend = rule.maximumSpend;
      }

      // Calculate rewards based on type
      if (rule.rewardType === 'cashback') {
        rewardEarned = (eligibleSpend * rule.rewardValue) / 100;
        rewardEarnedDollars = rewardEarned; // already in dollars
      } else {
        // Miles/points
        rewardEarned = eligibleSpend * rule.rewardValue;
        rewardEarnedDollars = rewardEarned * milesValuation;
      }
    }

    const maximumExceeded = !!rule.maximumSpend && totalSpend > rule.maximumSpend;
    const maximumProgress = rule.maximumSpend
      ? Math.min(100, (totalSpend / rule.maximumSpend) * 100)
      : 0;

    return {
      cardId: rule.cardId,
      ruleId: rule.id,
      period: period.name,
      totalSpend,
      eligibleSpend,
      rewardEarned,
      rewardEarnedDollars,
      rewardType: rule.rewardType,
      minimumProgress,
      maximumProgress,
      minimumMet,
      maximumExceeded,
      shouldStopUsing: maximumExceeded,
    };
  }

  /**
   * Calculate the current period for a given card
   */
  static calculatePeriod(card: CreditCard, targetDate: Date = new Date()): CalculationPeriod {
    let startDate: Date;
    let endDate: Date;

    if (card.billingCycle?.type === 'billing' && card.billingCycle.dayOfMonth) {
      // Custom billing cycle
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();

      const requestedBillingDay = card.billingCycle.dayOfMonth;
      const currentMonthEffectiveDay = getEffectiveBillingDay(year, month, requestedBillingDay);

      // Determine if we're in current or previous billing cycle
      const currentCycleStart = new Date(year, month, currentMonthEffectiveDay);
      if (targetDate < currentCycleStart) {
        // We're in the previous billing cycle
        const prevMonthEffectiveDay = getEffectiveBillingDay(year, month - 1, requestedBillingDay);
        startDate = new Date(year, month - 1, prevMonthEffectiveDay);
        endDate = new Date(year, month, currentMonthEffectiveDay - 1, 23, 59, 59, 999);
      } else {
        // We're in the current billing cycle
        startDate = currentCycleStart;
        const nextMonthEffectiveDay = getEffectiveBillingDay(year, month + 1, requestedBillingDay);
        endDate = new Date(year, month + 1, nextMonthEffectiveDay - 1, 23, 59, 59, 999);
      }
    } else {
      // Calendar month (default)
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    }

    const periodName = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

    return {
      startDate,
      endDate,
      name: periodName,
    };
  }

  /**
   * Get recent periods for a card
   */
  static getRecentPeriods(card: CreditCard, count: number = 3): CalculationPeriod[] {
    const periods: CalculationPeriod[] = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push(this.calculatePeriod(card, targetDate));
    }

    return periods;
  }
}