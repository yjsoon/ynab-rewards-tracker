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
  countedSpend: number;
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
  countedSpend: number;
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
  /** Period-aware reward attribution keyed by YNAB transaction ID. */
  transactionRewards: Record<string, TransactionRewardResult>;
}

export interface CalculationPeriod {
  start: string;
  end: string;
  label: string;
}

type TransactionRewardOptions = {
  flagColor?: string | null;
};

export type TransactionRewardReason =
  | 'excluded'
  | 'zero_amount'
  | 'zero_rate'
  | 'below_block'
  | 'below_minimum'
  | 'cap_reached';

export interface TransactionRewardBlock {
  size: number;
  count: number;
  eligibleAmount: number;
  remainder: number;
}

export interface TransactionRewardResult {
  reward: number;
  rewardDollars: number;
  rewardRate: number;
  block?: TransactionRewardBlock;
  /** @deprecated Prefer the structured `block` value and format it in the UI. */
  blockInfo?: string;
  reason?: TransactionRewardReason;
}

export class SimpleRewardsCalculator {
  /**
   * Calculate reward for a single transaction based on card settings
   */
  static calculateTransactionReward(
    amount: number,
    card: CreditCard,
    settings?: AppSettings,
    options?: TransactionRewardOptions
  ): TransactionRewardResult {
    const milesValuation = settings?.milesValuation ?? 0.01;
    const context = createSubcategoryContext(card);
    const flagColour = normaliseFlagColor(options?.flagColor);
    const subcategory = resolveSubcategory(context, flagColour);

    if (subcategory?.excludeFromRewards) {
      return {
        reward: 0,
        rewardDollars: 0,
        rewardRate: 0,
        reason: 'excluded',
      };
    }

    const rewardRate = getRewardRate(card, subcategory);
    if (amount <= 0) {
      return {
        reward: 0,
        rewardDollars: 0,
        rewardRate,
        reason: 'zero_amount',
      };
    }

    if (rewardRate <= 0) {
      return {
        reward: 0,
        rewardDollars: 0,
        rewardRate,
        reason: 'zero_rate',
      };
    }

    const blockSize = getBlockSize(card, subcategory);
    const { amount: earnableAmount, blocks } = applyBlock(amount, blockSize);
    const block = blockSize
      ? {
          size: blockSize,
          count: blocks,
          eligibleAmount: earnableAmount,
          remainder: Math.max(0, amount - earnableAmount),
        }
      : undefined;

    if (block && blocks === 0) {
      return {
        reward: 0,
        rewardDollars: 0,
        rewardRate,
        block,
        reason: 'below_block',
      };
    }

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

    return { reward, rewardDollars, block, blockInfo, rewardRate };
  }

  /**
   * Calculate the current period for a card based on billing cycle
   */
  static calculatePeriod(card: CreditCard, targetDate: Date = new Date()): CalculationPeriod {
    const period = calculateCardPeriod(card, targetDate);
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
    const milesValuation = settings?.milesValuation ?? 0.01;
    const context = createSubcategoryContext(card);

    const periodTransactions = transactions.filter((txn) => {
      const txnDate = txn.date;
      return txnDate >= period.start && txnDate <= period.end && txn.amount < 0;
    });

    const transactionRewards = Object.fromEntries(
      periodTransactions.map((transaction) => [
        transaction.id,
        this.calculateTransactionReward(
          Math.abs(transaction.amount) / 1000,
          card,
          settings,
          { flagColor: transaction.flag_color },
        ),
      ]),
    );
    let totalSpend = 0;
    let spendByFlag: Map<
      YnabFlagColor,
      { total: number; transactions: Array<{ transaction: Transaction; spend: number }> }
    > | undefined;
    if (context.enabled && context.activeSubcategories.length > 0) {
      spendByFlag = new Map();
      for (const txn of periodTransactions) {
        const flagColour = normaliseFlagColor(txn.flag_color);
        const subcategory = resolveSubcategory(context, flagColour);
        const txnSpend = Math.abs(txn.amount) / 1000;
        if (!subcategory?.excludeFromRewards) {
          totalSpend += txnSpend;
        }

        const effectiveFlag = subcategory?.flagColor ?? UNFLAGGED_FLAG.value;
        const prev = spendByFlag.get(effectiveFlag);
        if (prev) {
          prev.total += txnSpend;
          prev.transactions.push({ transaction: txn, spend: txnSpend });
        } else {
          spendByFlag.set(effectiveFlag, {
            total: txnSpend,
            transactions: [{ transaction: txn, spend: txnSpend }],
          });
        }
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
    let countedSpend = 0;
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;
    let subcategoryBreakdowns: SubcategoryCalculation[] | undefined;

    if (context.enabled && context.activeSubcategories.length > 0) {
      const subcategorySpends = spendByFlag ?? new Map<
        YnabFlagColor,
        { total: number; transactions: Array<{ transaction: Transaction; spend: number }> }
      >();
      const hasCardCap = typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0;
      let remainingCardCap = hasCardCap ? maximumSpend! : Number.POSITIVE_INFINITY;

      subcategoryBreakdowns = [];

      for (const subcategory of context.activeSubcategories) {
        if (subcategory.excludeFromRewards) {
          subcategoryBreakdowns.push({
            id: subcategory.id,
            name: subcategory.name,
            flagColor: subcategory.flagColor,
            totalSpend: subcategorySpends.get(subcategory.flagColor)?.total ?? 0,
            countedSpend: 0,
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

        const spendBucket = subcategorySpends.get(subcategory.flagColor);
        const totalForSubcategory = spendBucket?.total ?? 0;
        const transactionsForSubcategory = spendBucket?.transactions ?? [];
        const rewardRate = getRewardRate(card, subcategory);
        const blockSize = getBlockSize(card, subcategory);

        let subEligibleBeforeBlocks = 0;
        let subEligible = 0;
        let subCountedBeforeBlocks = 0;
        let subCounted = 0;
        let countedBlocks = 0;
        let blocksEarned = 0;
        let subReward = 0;
        let subRewardDollars = 0;

        const minimumNeeded = typeof subcategory.minimumSpend === 'number' ? subcategory.minimumSpend : null;
        const maximumAllowed = typeof subcategory.maximumSpend === 'number' && subcategory.maximumSpend > 0
          ? subcategory.maximumSpend
          : null;
        const subMinimumMet = minimumSpendMet && (!minimumNeeded || totalForSubcategory >= minimumNeeded);

        if (rewardRate > 0 && totalForSubcategory > 0) {
          let remainingSubcategoryCap = maximumAllowed ?? Number.POSITIVE_INFINITY;

          for (const { transaction, spend: txnSpend } of transactionsForSubcategory) {
            if (remainingCardCap <= 0 || remainingSubcategoryCap <= 0) {
              const standalone = transactionRewards[transaction.id];
              transactionRewards[transaction.id] = {
                ...standalone,
                reward: 0,
                rewardDollars: 0,
                reason: 'cap_reached',
              };
              continue;
            }
            if (txnSpend <= 0) {
              continue;
            }

            const spendContribution = Math.min(txnSpend, remainingCardCap, remainingSubcategoryCap);
            if (spendContribution <= 0) {
              continue;
            }

            subCountedBeforeBlocks += spendContribution;
            const blockResult = applyBlock(spendContribution, blockSize);
            subCounted += blockResult.amount;
            countedBlocks += blockResult.blocks;

            if (hasCardCap) {
              remainingCardCap = Math.max(0, remainingCardCap - blockResult.amount);
            }
            if (maximumAllowed) {
              remainingSubcategoryCap = Math.max(
                0,
                remainingSubcategoryCap - blockResult.amount,
              );
            }

            const constrained = this.calculateTransactionReward(
              spendContribution,
              card,
              settings,
              { flagColor: transaction.flag_color },
            );
            transactionRewards[transaction.id] = subMinimumMet
              ? constrained
              : {
                  ...constrained,
                  reward: 0,
                  rewardDollars: 0,
                  reason: 'below_minimum',
                };
          }

          countedSpend += subCounted;

          if (subMinimumMet) {
            subEligibleBeforeBlocks = subCountedBeforeBlocks;
            subEligible = subCounted;
            blocksEarned = countedBlocks;
          }
        }

        if (subMinimumMet && rewardRate > 0 && totalForSubcategory > 0) {
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
        }

        const cardCapHit = hasCardCap && remainingCardCap <= 0;
        const subMaxExceeded = maximumAllowed ? subCounted >= maximumAllowed : false;

        subcategoryBreakdowns.push({
          id: subcategory.id,
          name: subcategory.name,
          flagColor: subcategory.flagColor,
          totalSpend: totalForSubcategory,
          countedSpend: subCounted,
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
      if (typeof card.earningRate === 'number') {
        const hasCardCap = typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0;
        const spendCap = hasCardCap ? maximumSpend! : Number.POSITIVE_INFINITY;
        let remainingCap = spendCap;

        for (const txn of periodTransactions) {
          if (remainingCap <= 0) {
            const standalone = transactionRewards[txn.id];
            transactionRewards[txn.id] = {
              ...standalone,
              reward: 0,
              rewardDollars: 0,
              reason: 'cap_reached',
            };
            continue;
          }
          const txnSpend = Math.abs(txn.amount) / 1000;
          if (txnSpend <= 0) {
            continue;
          }
          const spendContribution = Math.min(txnSpend, remainingCap);

          let earnablePortion = spendContribution;
          if (card.earningBlockSize && card.earningBlockSize > 0) {
            const blocks = Math.floor(spendContribution / card.earningBlockSize);
            earnablePortion = blocks * card.earningBlockSize;
          }

          countedSpend += earnablePortion;

          if (minimumSpendMet) {
            eligibleSpendBeforeBlocks += spendContribution;
            eligibleSpend += earnablePortion;
          }

          remainingCap -= earnablePortion;

          const constrained = this.calculateTransactionReward(
            spendContribution,
            card,
            settings,
            { flagColor: txn.flag_color },
          );
          transactionRewards[txn.id] = minimumSpendMet
            ? constrained
            : {
                ...constrained,
                reward: 0,
                rewardDollars: 0,
                reason: 'below_minimum',
              };
        }

        if (minimumSpendMet && eligibleSpend > 0) {
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

    const maximumSpendExceeded = isMaximumSpendExceeded(countedSpend, maximumSpend);
    const maximumSpendProgress = calculateMaximumSpendProgress(countedSpend, maximumSpend);

    return {
      cardId: card.id,
      period: period.label,
      totalSpend,
      countedSpend,
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
      transactionRewards,
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
