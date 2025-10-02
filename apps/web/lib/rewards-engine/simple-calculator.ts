/**
 * Simplified rewards calculation using card earning rates
 */

import type { AppSettings, CardSubcategory, CreditCard } from '@/lib/storage';
import type { Transaction } from '@/types/transaction';
import {
  calculateMaximumSpendProgress,
  calculateMinimumSpendProgress,
  isMaximumSpendExceeded,
  isMinimumSpendMet,
} from '@/lib/minimum-spend-helpers';
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '@/lib/ynab-constants';
import { formatLocalDate, getEffectiveBillingDay } from './date-utils';

const FLAG_COLOUR_SET: Set<YnabFlagColor> = new Set([
  UNFLAGGED_FLAG.value,
  ...YNAB_FLAG_COLORS.map((flag) => flag.value),
]);

export interface SubcategoryCalculation {
  id: string;
  name: string;
  flagColor: YnabFlagColor;
  totalSpend: number;
  eligibleSpendBeforeBlocks: number;
  eligibleSpend: number;
  rewardRate: number;
  rewardEarned: number;
  rewardEarnedDollars: number;
  minimumSpend?: number | null;
  minimumSpendMet: boolean;
  maximumSpend?: number | null;
  maximumSpendExceeded: boolean;
  blockSize?: number | null;
  blocksEarned?: number;
  active: boolean;
  excluded: boolean;
}

export interface SimplifiedCalculation {
  cardId: string;
  period: string;
  totalSpend: number;
  eligibleSpend: number; // Spend that actually earns rewards after gating and block rounding
  eligibleSpendBeforeBlocks?: number; // Spend eligible after min/max limits but before block rounding
  rewardEarned: number; // Raw reward units (dollars for cashback, miles for miles cards)
  rewardEarnedDollars: number; // Normalised dollar value for comparison
  rewardType: 'cashback' | 'miles';
  // Minimum spend tracking
  minimumSpend?: number | null; // Required spending threshold (null = not configured, 0 = no minimum, >0 = has minimum)
  minimumSpendMet: boolean; // Whether minimum spend requirement is satisfied
  minimumSpendProgress?: number; // Progress toward minimum (0-100) if applicable
  // Maximum spend tracking
  maximumSpend?: number | null; // Spending cap (null = not configured, 0 = no limit, >0 = has limit)
  maximumSpendExceeded: boolean; // Whether maximum spend limit has been exceeded
  maximumSpendProgress?: number; // Progress toward maximum (0-100) if applicable
  subcategoryBreakdowns?: SubcategoryCalculation[];
}

export interface CalculationPeriod {
  start: string; // ISO date string
  end: string; // ISO date string
  label: string;
}

type SubcategoryContext = {
  enabled: boolean;
  activeSubcategories: CardSubcategory[];
  map: Map<YnabFlagColor, CardSubcategory>;
  fallback: CardSubcategory | undefined;
};

type TransactionRewardOptions = {
  flagColor?: string | null;
};

export class SimpleRewardsCalculator {
  private static normaliseFlagColor(flagColor?: string | null): YnabFlagColor {
    if (!flagColor) {
      return UNFLAGGED_FLAG.value;
    }
    const lowered = flagColor.toLowerCase() as YnabFlagColor;
    return FLAG_COLOUR_SET.has(lowered) ? lowered : UNFLAGGED_FLAG.value;
  }

  private static getSubcategoryContext(card: CreditCard): SubcategoryContext {
    const enabled = Boolean(card.subcategoriesEnabled);
    const rawSubcategories = Array.isArray(card.subcategories) ? card.subcategories : [];
    const activeSubcategories = enabled
      ? rawSubcategories
          .filter((sub) => sub && sub.active !== false)
          .sort((a, b) => a.priority - b.priority)
      : [];

    const map = new Map<YnabFlagColor, CardSubcategory>();
    for (const sub of activeSubcategories) {
      map.set(sub.flagColor, sub);
    }

    const fallback = enabled ? map.get(UNFLAGGED_FLAG.value) : undefined;

    return {
      enabled,
      activeSubcategories,
      map,
      fallback,
    };
  }

  private static getBlockSize(card: CreditCard, subcategory?: CardSubcategory | undefined): number | null {
    if (card.type === 'miles' && subcategory && subcategory.milesBlockSize && subcategory.milesBlockSize > 0) {
      return subcategory.milesBlockSize;
    }

    if (card.earningBlockSize && card.earningBlockSize > 0) {
      return card.earningBlockSize;
    }

    return null;
  }

  private static getRewardRate(card: CreditCard, subcategory?: CardSubcategory | undefined): number {
    if (subcategory && typeof subcategory.rewardValue === 'number') {
      return subcategory.rewardValue;
    }
    return typeof card.earningRate === 'number' ? card.earningRate : 0;
  }

  private static applyBlock(eligibleAmount: number, blockSize: number | null): { amount: number; blocks: number } {
    if (!blockSize || blockSize <= 0) {
      return { amount: eligibleAmount, blocks: 0 };
    }
    const blocks = Math.floor(eligibleAmount / blockSize);
    return {
      amount: blocks * blockSize,
      blocks,
    };
  }

  private static getSubcategoryForFlag(
    context: SubcategoryContext,
    flagColor: YnabFlagColor
  ): CardSubcategory | undefined {
    if (!context.enabled) {
      return undefined;
    }
    return context.map.get(flagColor) ?? context.fallback;
  }

  /**
   * Calculate reward for a single transaction based on card settings
   */
  static calculateTransactionReward(
    amount: number, // In dollars (positive)
    card: CreditCard,
    settings?: AppSettings,
    options?: TransactionRewardOptions
  ): { reward: number; rewardDollars: number; blockInfo?: string; rewardRate: number } {
    const milesValuation = settings?.milesValuation || 0.01;
    const context = this.getSubcategoryContext(card);
    const flagColour = this.normaliseFlagColor(options?.flagColor);
    const subcategory = this.getSubcategoryForFlag(context, flagColour);

    const rewardRate = this.getRewardRate(card, subcategory);
    if (!rewardRate || rewardRate === 0) {
      return { reward: 0, rewardDollars: 0, rewardRate: 0 };
    }

    const blockSize = this.getBlockSize(card, subcategory);
    const { amount: earnableAmount, blocks } = this.applyBlock(amount, blockSize);

    let reward = 0;
    let rewardDollars = 0;

    if (card.type === 'cashback') {
      reward = earnableAmount * (rewardRate / 100);
      rewardDollars = reward;
    } else {
      reward = earnableAmount * rewardRate;
      rewardDollars = reward * milesValuation;
    }

    const blockInfo = blockSize && blocks > 0 ? `${blocks} block${blocks !== 1 ? 's' : ''} × $${blockSize}` : undefined;

    return { reward, rewardDollars, blockInfo, rewardRate };
  }

  /**
   * Calculate the current period for a card based on billing cycle
   */
  static calculatePeriod(card: CreditCard): CalculationPeriod {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (card.billingCycle?.type === 'billing' && card.billingCycle.dayOfMonth) {
      const requestedBillingDay = card.billingCycle.dayOfMonth;
      const currentMonthEffectiveDay = getEffectiveBillingDay(year, month, requestedBillingDay);

      let startDate: Date;
      let endDate: Date;

      if (now.getDate() >= currentMonthEffectiveDay) {
        // We're in current billing cycle
        startDate = new Date(year, month, currentMonthEffectiveDay);
        const nextMonthEffectiveDay = getEffectiveBillingDay(year, month + 1, requestedBillingDay);
        endDate = new Date(year, month + 1, nextMonthEffectiveDay - 1, 23, 59, 59, 999);
      } else {
        // We're in previous billing cycle
        const prevMonthEffectiveDay = getEffectiveBillingDay(year, month - 1, requestedBillingDay);
        startDate = new Date(year, month - 1, prevMonthEffectiveDay);
        endDate = new Date(year, month, currentMonthEffectiveDay - 1, 23, 59, 59, 999);
      }

      return {
        start: formatLocalDate(startDate),
        end: formatLocalDate(endDate),
        label: formatLocalDate(startDate),
      };
    }

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

    return {
      start: formatLocalDate(startDate),
      end: formatLocalDate(endDate),
      label: `${year}-${String(month + 1).padStart(2, '0')}`,
    };
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
    const milesValuation = settings?.milesValuation || 0.01;
    const context = this.getSubcategoryContext(card);

    const periodTransactions = transactions.filter((txn) => {
      const txnDate = txn.date;
      return txnDate >= period.start && txnDate <= period.end && txn.amount < 0;
    });

    // Calculate total spend, excluding transactions with excluded subcategories if applicable
    let totalSpend = 0;
    if (context.enabled && context.activeSubcategories.length > 0) {
      for (const txn of periodTransactions) {
        const flagColour = this.normaliseFlagColor(txn.flag_color);
        const subcategory = this.getSubcategoryForFlag(context, flagColour);

        // Skip excluded subcategories from total spend
        if (subcategory?.excludeFromRewards) {
          continue;
        }

        totalSpend += Math.abs(txn.amount) / 1000;
      }
    } else {
      // No subcategories, count all transactions
      totalSpend = Math.abs(periodTransactions.reduce((sum, txn) => sum + txn.amount, 0)) / 1000;
    }

    const minimumSpend = card.minimumSpend;
    const minimumSpendMet = isMinimumSpendMet(totalSpend, minimumSpend);
    const minimumSpendProgress = calculateMinimumSpendProgress(totalSpend, minimumSpend);

    const maximumSpend = card.maximumSpend;

    let eligibleSpend = 0;
    let eligibleSpendBeforeBlocks = 0;
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;
    let subcategoryBreakdowns: SubcategoryCalculation[] | undefined;

    if (context.enabled && context.activeSubcategories.length > 0) {
      const spendByFlag = new Map<YnabFlagColor, number>();
      for (const txn of periodTransactions) {
        const flagColour = this.normaliseFlagColor(txn.flag_color);
        const subcategory = this.getSubcategoryForFlag(context, flagColour);

        // Skip excluded subcategories entirely - they don't count toward anything
        if (subcategory?.excludeFromRewards) {
          continue;
        }

        const effectiveFlag = subcategory?.flagColor ?? UNFLAGGED_FLAG.value;
        const prev = spendByFlag.get(effectiveFlag) ?? 0;
        spendByFlag.set(effectiveFlag, prev + Math.abs(txn.amount) / 1000);
      }

      const hasCardCap = typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0;
      let remainingCardCap = hasCardCap ? maximumSpend! : Number.POSITIVE_INFINITY;

      subcategoryBreakdowns = [];

      for (const subcategory of context.activeSubcategories) {
        // Skip excluded subcategories from rewards calculations
        if (subcategory.excludeFromRewards) {
          // Add to breakdown with 0 rewards for visibility
          subcategoryBreakdowns.push({
            id: subcategory.id,
            name: subcategory.name,
            flagColor: subcategory.flagColor,
            totalSpend: spendByFlag.get(subcategory.flagColor) ?? 0,
            eligibleSpendBeforeBlocks: 0,
            eligibleSpend: 0,
            rewardRate: 0,
            rewardEarned: 0,
            rewardEarnedDollars: 0,
            minimumSpend: subcategory.minimumSpend,
            minimumSpendMet: false,
            maximumSpend: subcategory.maximumSpend,
            maximumSpendExceeded: false,
            blockSize: null,
            active: subcategory.active !== false,
            excluded: true,
          });
          continue;
        }

        const totalForSubcategory = spendByFlag.get(subcategory.flagColor) ?? 0;
        const rewardRate = this.getRewardRate(card, subcategory);
        const blockSize = this.getBlockSize(card, subcategory);

        let subEligibleBeforeBlocks = 0;
        let subEligible = 0;
        let blocksEarned = 0;
        let subReward = 0;
        let subRewardDollars = 0;

        const minimumNeeded = typeof subcategory.minimumSpend === 'number' ? subcategory.minimumSpend : null;
        const maximumAllowed = typeof subcategory.maximumSpend === 'number' && subcategory.maximumSpend > 0
          ? subcategory.maximumSpend
          : null;
        const subMinimumMet = minimumSpendMet && (!minimumNeeded || totalForSubcategory >= minimumNeeded);

        if (subMinimumMet && rewardRate > 0 && totalForSubcategory > 0) {
          const cappedBySubcategory = maximumAllowed
            ? Math.min(totalForSubcategory, maximumAllowed)
            : totalForSubcategory;

          const cappedByCard = Math.min(cappedBySubcategory, remainingCardCap);

          subEligibleBeforeBlocks = cappedByCard;

          const blockResult = this.applyBlock(subEligibleBeforeBlocks, blockSize);
          subEligible = blockResult.amount;
          blocksEarned = blockResult.blocks;

          if (card.type === 'cashback') {
            subReward = subEligible * (rewardRate / 100);
            subRewardDollars = subReward;
          } else {
            subReward = subEligible * rewardRate;
            subRewardDollars = subReward * milesValuation;
          }

          eligibleSpendBeforeBlocks += subEligibleBeforeBlocks;
          eligibleSpend += subEligible;
          rewardEarned += subReward;
          rewardEarnedDollars += subRewardDollars;

          if (hasCardCap) {
            remainingCardCap = Math.max(0, remainingCardCap - subEligibleBeforeBlocks);
          }
        }

        const cardCapHit = hasCardCap && remainingCardCap <= 0;
        const subMaxExceeded = maximumAllowed ? totalForSubcategory >= maximumAllowed : false;

        subcategoryBreakdowns.push({
          id: subcategory.id,
          name: subcategory.name,
          flagColor: subcategory.flagColor,
          totalSpend: totalForSubcategory,
          eligibleSpendBeforeBlocks: subEligibleBeforeBlocks,
          eligibleSpend: subEligible,
          rewardRate,
          rewardEarned: subReward,
          rewardEarnedDollars: subRewardDollars,
          minimumSpend: minimumNeeded,
          minimumSpendMet: subMinimumMet,
          maximumSpend: maximumAllowed,
          maximumSpendExceeded: subMaxExceeded || cardCapHit,
          blockSize,
          blocksEarned: blocksEarned || undefined,
          active: subcategory.active !== false,
          excluded: false,
        });
      }
    } else {
      if (minimumSpendMet && card.earningRate) {
        const hasCardCap = typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0;
        const spendCap = hasCardCap ? maximumSpend! : Number.POSITIVE_INFINITY;
        let remainingCap = spendCap;

        for (const txn of periodTransactions) {
          if (remainingCap <= 0) {
            break;
          }
          const txnSpend = Math.abs(txn.amount) / 1000;
          if (txnSpend <= 0) {
            continue;
          }
          const spendContribution = Math.min(txnSpend, remainingCap);
          eligibleSpendBeforeBlocks += spendContribution;

          let earnablePortion = spendContribution;
          if (card.earningBlockSize && card.earningBlockSize > 0) {
            const blocks = Math.floor(spendContribution / card.earningBlockSize);
            earnablePortion = blocks * card.earningBlockSize;
          }

          eligibleSpend += earnablePortion;
          remainingCap -= spendContribution;
        }

        if (eligibleSpend > 0) {
          if (card.type === 'cashback') {
            rewardEarned = eligibleSpend * (card.earningRate / 100);
            rewardEarnedDollars = rewardEarned;
          } else {
            rewardEarned = eligibleSpend * card.earningRate;
            rewardEarnedDollars = rewardEarned * milesValuation;
          }
        }
      }
    }

    const maximumSpendExceededRaw = isMaximumSpendExceeded(totalSpend, maximumSpend);
    const maximumSpendExceededByEligible =
      typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0
        ? (eligibleSpendBeforeBlocks ?? 0) >= maximumSpend
        : false;
    const maximumSpendExceeded = maximumSpendExceededRaw || maximumSpendExceededByEligible;

    const baselineForMaxProgress = eligibleSpendBeforeBlocks ?? totalSpend;
    const maximumSpendProgress = calculateMaximumSpendProgress(baselineForMaxProgress, maximumSpend);

    return {
      cardId: card.id,
      period: period.label,
      totalSpend,
      eligibleSpend,
      eligibleSpendBeforeBlocks,
      rewardEarned,
      rewardEarnedDollars,
      rewardType: card.type,
      minimumSpend,
      minimumSpendMet,
      minimumSpendProgress,
      maximumSpend,
      maximumSpendExceeded,
      maximumSpendProgress,
      subcategoryBreakdowns,
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
    const eligibleCards = cards.filter((c) => c.earningRate);

    if (eligibleCards.length === 0) return null;

    let bestCard = eligibleCards[0];
    let bestCalculation = this.calculateCardRewards(bestCard, transactions, period, settings);

    for (const card of eligibleCards.slice(1)) {
      const calculation = this.calculateCardRewards(card, transactions, period, settings);
      if (calculation.rewardEarnedDollars > bestCalculation.rewardEarnedDollars) {
        bestCard = card;
        bestCalculation = calculation;
      }
    }

    return { card: bestCard, calculation: bestCalculation };
  }
}
