/**
 * Simplified rewards calculation using card earning rates
 */

import type { AppSettings, CreditCard, Transaction } from '../storage/types';
import {
  calculateMaximumSpendProgress,
  calculateMinimumSpendProgress,
  isMaximumSpendExceeded,
  isMinimumSpendMet,
} from '../utils/minimum-spend-helpers';
import { UNFLAGGED_FLAG, type YnabFlagColor } from '../ynab/constants';
import { calculateCardPeriod, toSimplePeriod } from './utils/periods';
import {
  createSubcategoryContext,
  normaliseFlagColor,
  resolveSubcategory,
} from './utils/subcategories';
import { applyBlock, getBlockSize, getRewardRate } from './utils/reward-math';

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
  eligibleSpend: number;
  eligibleSpendBeforeBlocks?: number;
  rewardEarned: number;
  rewardEarnedDollars: number;
  rewardType: 'cashback' | 'miles';
  minimumSpend?: number | null;
  minimumSpendMet: boolean;
  minimumSpendProgress?: number;
  maximumSpend?: number | null;
  maximumSpendExceeded: boolean;
  maximumSpendProgress?: number;
  subcategoryBreakdowns?: SubcategoryCalculation[];
}

export interface CalculationPeriod {
  start: string;
  end: string;
  label: string;
}

type TransactionRewardOptions = {
  flagColor?: string | null;
};

export class SimpleRewardsCalculator {
  /**
   * Calculate reward for a single transaction based on card settings
   */
  static calculateTransactionReward(
    amount: number,
    card: CreditCard,
    settings?: AppSettings,
    options?: TransactionRewardOptions
  ): { reward: number; rewardDollars: number; blockInfo?: string; rewardRate: number } {
    const milesValuation = settings?.milesValuation || 0.01;
    const context = createSubcategoryContext(card);
    const flagColour = normaliseFlagColor(options?.flagColor);
    const subcategory = resolveSubcategory(context, flagColour);

    const rewardRate = getRewardRate(card, subcategory);
    if (!rewardRate || rewardRate === 0) {
      return { reward: 0, rewardDollars: 0, rewardRate: 0 };
    }

    const blockSize = getBlockSize(card, subcategory);
    const { amount: earnableAmount, blocks } = applyBlock(amount, blockSize);

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
    const period = calculateCardPeriod(card);
    const useStartLabel = Boolean(card.billingCycle?.type === 'billing' && card.billingCycle.dayOfMonth);

    return toSimplePeriod(period, useStartLabel);
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
    const context = createSubcategoryContext(card);

    const periodTransactions = transactions.filter((txn) => {
      const txnDate = txn.date;
      return txnDate >= period.start && txnDate <= period.end && txn.amount < 0;
    });

    let totalSpend = 0;
    if (context.enabled && context.activeSubcategories.length > 0) {
      for (const txn of periodTransactions) {
        const flagColour = normaliseFlagColor(txn.flag_color);
        const subcategory = resolveSubcategory(context, flagColour);

        if (subcategory?.excludeFromRewards) {
          continue;
        }

        totalSpend += Math.abs(txn.amount) / 1000;
      }
    } else {
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
        const flagColour = normaliseFlagColor(txn.flag_color);
        const subcategory = resolveSubcategory(context, flagColour);

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
        if (subcategory.excludeFromRewards) {
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
        const rewardRate = getRewardRate(card, subcategory);
        const blockSize = getBlockSize(card, subcategory);

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

          const blockResult = applyBlock(subEligibleBeforeBlocks, blockSize);
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