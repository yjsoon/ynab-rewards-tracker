/**
 * Core rewards calculation logic
 */

import type { 
  RewardRule, 
  CreditCard, 
  TagMapping, 
  RewardCalculation,
  CategoryBreakdown,
  AppSettings 
} from '@/lib/storage';
import type { TransactionWithRewards } from '@/types/transaction';
import { absFromMilli } from '@/lib/utils';

export interface CalculationPeriod {
  startDate: Date;
  endDate: Date;
  name: string;
}

export class RewardsCalculator {
  private static readonly DEFAULT_BILLING_DAY = 1;
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

    // Filter transactions to this period and eligible categories
    const eligibleTransactions = transactions.filter(txn => {
      const txnDate = new Date(txn.date);
      return (
        txnDate >= period.startDate &&
        txnDate <= period.endDate &&
        txn.rewardCategory &&
        rule.categories.includes(txn.rewardCategory)
      );
    });

    // Calculate total and eligible spend
    const totalSpend = Math.abs(
      eligibleTransactions.reduce((sum, txn) => sum + txn.amount, 0)
    ) / 1000; // Convert from milliunits

    let eligibleSpend = totalSpend;
    let rewardEarned = 0;
    const categoryBreakdowns: CategoryBreakdown[] = [];

    // Group by category for breakdown
    const categorySpends = new Map<string, number>();
    eligibleTransactions.forEach(txn => {
      const category = txn.rewardCategory!;
      const amount = absFromMilli(txn.amount);
      categorySpends.set(category, (categorySpends.get(category) || 0) + amount);
    });

    // Calculate rewards per category with caps
    // First pass: calculate raw rewards without overall cap
    categorySpends.forEach((spend, category) => {
      let categoryEligibleSpend = spend;
      let categoryReward = 0;
    let categoryRewardDollars = 0;
      let capReached = false;

      // Apply category-specific caps
      const categoryCap = rule.categoryCaps?.find(cap => cap.category === category);
      if (categoryCap && spend > categoryCap.maxSpend) {
        categoryEligibleSpend = categoryCap.maxSpend;
        capReached = true;
      }

      // Calculate reward based on type
      if (rule.rewardType === 'cashback') {
        categoryReward = (categoryEligibleSpend * rule.rewardValue) / 100;
        categoryRewardDollars = categoryReward; // already in dollars
      } else if (rule.rewardType === 'miles') {
        if (rule.milesBlockSize) {
          // Block-based miles (e.g., "$5 blocks"): rewardValue is miles per dollar,
          // and milesBlockSize is the dollar size of one block. Each full block
          // yields milesBlockSize * rewardValue miles.
          const blocks = Math.floor(categoryEligibleSpend / rule.milesBlockSize);
          categoryReward = blocks * rule.rewardValue * rule.milesBlockSize;
        } else {
          // Regular miles per dollar
          categoryReward = categoryEligibleSpend * rule.rewardValue;
        }
        // Convert miles to dollars for comparison
        categoryRewardDollars = categoryReward * milesValuation;
      }

      categoryBreakdowns.push({
        category,
        spend,
        reward: categoryReward,
        rewardDollars: categoryRewardDollars,
        capReached
      });

      rewardEarned += categoryReward;
    });

    // Apply overall spending cap to eligible spend
    // If total spend exceeds the maximum, we need to scale down rewards proportionally
    if (rule.maximumSpend && totalSpend > rule.maximumSpend) {
      const scaleFactor = rule.maximumSpend / totalSpend;
      eligibleSpend = rule.maximumSpend;
      
      // Scale down all category rewards proportionally
      categoryBreakdowns.forEach(breakdown => {
        breakdown.reward *= scaleFactor;
        if (breakdown.rewardDollars) {
          breakdown.rewardDollars *= scaleFactor;
        }
      });
      
      // Recalculate total reward
      rewardEarned = categoryBreakdowns.reduce((sum, cat) => sum + cat.reward, 0);
    } else if (rule.maximumSpend) {
      // Even if not exceeded, cap eligible spend at maximum
      eligibleSpend = Math.min(eligibleSpend, rule.maximumSpend);
    }

    // Calculate progress percentages
    const minimumProgress = rule.minimumSpend 
      ? Math.min(100, (eligibleSpend / rule.minimumSpend) * 100)
      : undefined;
    
    const maximumProgress = rule.maximumSpend 
      ? Math.min(100, (eligibleSpend / rule.maximumSpend) * 100)
      : undefined;

    // Determine status flags
    const minimumMet = !rule.minimumSpend || eligibleSpend >= rule.minimumSpend;
    const maximumExceeded = !!rule.maximumSpend && eligibleSpend >= rule.maximumSpend;
    const shouldStopUsing = maximumExceeded;

    // Calculate normalized dollar value for the total reward
    let rewardEarnedDollars: number = rewardEarned; // default for cashback
    if (rule.rewardType === 'miles') {
      rewardEarnedDollars = rewardEarned * milesValuation;
    }

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
      categoryBreakdowns,
      minimumMet,
      maximumExceeded,
      shouldStopUsing
    };
  }

  /**
   * Calculate period dates based on card billing cycle
   */
  static calculatePeriod(card: CreditCard, targetDate: Date = new Date()): CalculationPeriod {
    let startDate: Date;
    let endDate: Date;
    let label: string;

    // Default to calendar month if billingCycle is not defined
    if (!card.billingCycle || card.billingCycle.type === 'calendar') {
      // Calendar month
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
      label = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
    } else {
      // Billing cycle
      const dayOfMonth = card.billingCycle.dayOfMonth || this.DEFAULT_BILLING_DAY;
      
      if (targetDate.getDate() >= dayOfMonth) {
        // Current billing period
        startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), dayOfMonth);
        endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, dayOfMonth - 1);
      } else {
        // Previous billing period
        startDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, dayOfMonth);
        endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), dayOfMonth - 1);
      }
      
      label = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${dayOfMonth}`;
    }

    return { startDate, endDate, name: label };
  }

  /**
   * Get recent periods for a card
   */
  static getRecentPeriods(card: CreditCard, count: number = 3): CalculationPeriod[] {
    const periods: CalculationPeriod[] = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      let targetDate: Date;
      
      if (!card.billingCycle || card.billingCycle.type === 'calendar') {
        targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      } else {
        const dayOfMonth = card.billingCycle.dayOfMonth || this.DEFAULT_BILLING_DAY;
        targetDate = new Date(now.getFullYear(), now.getMonth() - i, dayOfMonth);
      }
      
      periods.push(this.calculatePeriod(card, targetDate));
    }

    return periods;
  }
}
