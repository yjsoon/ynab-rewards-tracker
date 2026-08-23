/**
 * Simplified rewards calculation using card earning rates
 */

import type {
  AppSettings,
  CreditCard,
  MonthlyQualificationBreakdown,
  RewardQualificationStatus,
  Transaction,
} from '../storage/types';
import {
  calculateMaximumSpendProgress,
  calculateMinimumSpendProgress,
  isMaximumSpendExceeded,
  isMinimumSpendMet,
} from '../utils/minimum-spend-helpers';
import { UNFLAGGED_FLAG, type YnabFlagColor } from '../ynab/constants';
import {
  calculateCardPeriod,
  getRewardPeriodMonths,
  isRewardPeriodActive,
  toSimplePeriod,
} from './utils/periods';
import {
  createSubcategoryContext,
  normaliseFlagColor,
  resolveSubcategory,
} from './utils/subcategories';
import { applyBlock, getBlockSize, getRewardRate } from './utils/reward-math';
import {
  evaluateRewardPeriodQualification,
  getRewardPeriodMinimumScope,
} from './utils/reward-period-qualification';
import { resolveCardSpendingTier } from './utils/spending-tiers';

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
  monthlyMinimumSpend?: number;
  qualificationStatus?: RewardQualificationStatus;
  monthlyQualifications?: MonthlyQualificationBreakdown[];
  maximumSpend?: number | null;
  maximumSpendExceeded: boolean;
  maximumSpendProgress?: number;
  subcategoryBreakdowns?: SubcategoryCalculation[];
  activeSpendingTierId?: string | null;
  /** Period-aware reward attribution keyed by YNAB transaction ID. */
  transactionRewards: Record<string, TransactionRewardResult>;
}

export interface CalculationPeriod {
  start: string;
  end: string;
  label: string;
  /** Date through which an incomplete period is being viewed. */
  asOf?: string;
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
  | 'cap_reached'
  | 'period_incomplete';

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

function isCapHeadroomExhausted(
  remaining: number,
  blockSize: number | null | undefined,
): boolean {
  return blockSize && blockSize > 0
    ? remaining < blockSize
    : remaining <= 0;
}

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isSpendRefund(transaction: Transaction): boolean {
  if (transaction.amount <= 0) {
    return false;
  }

  // Payments and account-to-account reimbursements are transfers, not
  // reductions in purchase spend. The payee fallback covers older cached
  // transactions saved before transfer metadata was retained.
  if (
    transaction.transfer_account_id ||
    /^transfer\s*:/i.test(transaction.payee_name?.trim() ?? '')
  ) {
    return false;
  }

  // A merchant refund is normally credited back to its spending category.
  // Ready-to-Assign inflows, card rebates and uncategorised credits are not
  // purchase reversals and therefore must not reduce qualifying spend.
  const category = transaction.category_name?.trim();
  return Boolean(
    category &&
    category.toLowerCase() !== 'uncategorized' &&
    !category.toLowerCase().startsWith('inflow:'),
  );
}

function calculateMonthlyQualification(
  card: CreditCard,
  transactions: Transaction[],
  period: CalculationPeriod,
): {
  status: RewardQualificationStatus;
  breakdowns?: MonthlyQualificationBreakdown[];
  progress?: number;
} {
  const today = dateValue(new Date());
  const qualificationDateValue = period.asOf
    ?? (period.end < today ? period.end : today);
  const qualificationDate = parseDateValue(qualificationDateValue);
  if (
    !card.rewardPeriod ||
    card.rewardPeriod.monthlyMinimumSpend <= 0 ||
    !isRewardPeriodActive(card, qualificationDate)
  ) {
    return { status: 'not_required' };
  }

  const requestedAsOf = period.asOf ?? (period.end < today ? period.end : today);
  const asOf = requestedAsOf < today ? requestedAsOf : today;
  const cardPeriod = {
    startDate: parseDateValue(period.start),
    endDate: parseDateValue(period.end),
    label: period.label,
  };
  const minimumSpend = card.rewardPeriod.monthlyMinimumSpend;
  const monthSpend = getRewardPeriodMonths(card, cardPeriod).map((month) => {
    const start = dateValue(month.startDate);
    const end = dateValue(month.endDate);
    const netMilliunits = transactions.reduce((sum, transaction) => {
      if (
        transaction.date < start ||
        transaction.date > end ||
        transaction.date > asOf ||
        (transaction.amount >= 0 && !isSpendRefund(transaction))
      ) {
        return sum;
      }
      return sum + transaction.amount;
    }, 0);
    const spend = Math.max(0, -netMilliunits / 1000);
    return { start, end, spend, minimumSpend, status: 'pending' } as MonthlyQualificationBreakdown;
  });
  const qualification = evaluateRewardPeriodQualification({
    scope: getRewardPeriodMinimumScope(card.rewardPeriod),
    months: monthSpend,
    asOf,
    today,
  });

  return {
    status: qualification.status,
    breakdowns: qualification.months,
    progress: qualification.progress,
  };
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

    if (context.enabled && !subcategory) {
      return {
        reward: 0,
        rewardDollars: 0,
        rewardRate: 0,
        reason: 'zero_rate',
      };
    }

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
    const configuredContext = createSubcategoryContext(card);

    const requestedCutoff = period.asOf && period.asOf < period.end
      ? period.asOf
      : period.end;
    const today = dateValue(new Date());
    const transactionCutoff = period.asOf && requestedCutoff > today
      ? today
      : requestedCutoff;
    const qualificationTransactions = transactions.filter((txn) => (
      txn.date >= period.start && txn.date <= transactionCutoff
    ));

    const periodTransactions = qualificationTransactions
      .filter((txn) => {
        return txn.amount < 0;
      })
      .sort((left, right) => (
        left.date.localeCompare(right.date) || left.id.localeCompare(right.id)
      ));

    const monthlyQualification = calculateMonthlyQualification(
      card,
      qualificationTransactions,
      period,
    );
    const qualificationMet = monthlyQualification.status === 'not_required'
      || monthlyQualification.status === 'met';

    let totalSpend = 0;
    let spendByFlag: Map<
      YnabFlagColor,
      { total: number; transactions: Array<{ transaction: Transaction; spend: number }> }
    > | undefined;
    if (configuredContext.enabled && configuredContext.activeSubcategories.length > 0) {
      spendByFlag = new Map();
      for (const txn of periodTransactions) {
        const flagColour = normaliseFlagColor(txn.flag_color);
        const subcategory = resolveSubcategory(configuredContext, flagColour);
        const txnSpend = Math.abs(txn.amount) / 1000;
        if (subcategory && !subcategory.excludeFromRewards) {
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

    const resolvedSpendingTier = resolveCardSpendingTier(card, totalSpend);
    const calculationCard = resolvedSpendingTier.effectiveCard;
    const context = createSubcategoryContext(calculationCard);
    const transactionRewards = Object.fromEntries(
      periodTransactions.map((transaction) => [
        transaction.id,
        this.calculateTransactionReward(
          Math.abs(transaction.amount) / 1000,
          calculationCard,
          settings,
          { flagColor: transaction.flag_color },
        ),
      ]),
    );

    const minimumSpend = calculationCard.minimumSpend;
    const minimumSpendMet = qualificationMet && resolvedSpendingTier.minimumSpendMet &&
      isMinimumSpendMet(totalSpend, minimumSpend);
    const minimumSpendProgress = monthlyQualification.progress
      ?? calculateMinimumSpendProgress(totalSpend, minimumSpend);

    const maximumSpend = calculationCard.maximumSpend;

    let eligibleSpend = 0;
    let eligibleSpendBeforeBlocks = 0;
    let countedSpend = 0;
    let rewardEarned = 0;
    let rewardEarnedDollars = 0;
    let maximumCapacityExhausted = false;
    let subcategoryBreakdowns: SubcategoryCalculation[] | undefined;

    if (context.enabled && context.activeSubcategories.length > 0) {
      const subcategorySpends = spendByFlag ?? new Map<
        YnabFlagColor,
        { total: number; transactions: Array<{ transaction: Transaction; spend: number }> }
      >();
      const hasCardCap = typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0;
      let remainingCardCap = hasCardCap ? maximumSpend! : Number.POSITIVE_INFINITY;
      type TierState = {
        subcategory: (typeof context.activeSubcategories)[number];
        total: number;
        rewardRate: number;
        blockSize: number | null;
        minimum: number | null;
        maximum: number | null;
        minimumMet: boolean;
        remainingCap: number;
        countedBeforeBlocks: number;
        counted: number;
        blocks: number;
      };
      const tierStates = new Map<string, TierState>(context.activeSubcategories.map((subcategory) => {
        const total = subcategorySpends.get(subcategory.flagColor)?.total ?? 0;
        const minimum = typeof subcategory.minimumSpend === 'number'
          ? subcategory.minimumSpend
          : null;
        const maximum = typeof subcategory.maximumSpend === 'number' && subcategory.maximumSpend > 0
          ? subcategory.maximumSpend
          : null;
        return [subcategory.id, {
          subcategory,
          total,
          rewardRate: subcategory.excludeFromRewards ? 0 : getRewardRate(calculationCard, subcategory),
          blockSize: subcategory.excludeFromRewards ? null : getBlockSize(calculationCard, subcategory),
          minimum,
          maximum,
          minimumMet: !subcategory.excludeFromRewards &&
            minimumSpendMet &&
            (!minimum || total >= minimum),
          remainingCap: maximum ?? Number.POSITIVE_INFINITY,
          countedBeforeBlocks: 0,
          counted: 0,
          blocks: 0,
        }];
      }));

      // A card cap belongs to the card, not to tier priority. Consume it once
      // across the globally chronological transaction sequence.
      for (const transaction of periodTransactions) {
        const subcategory = resolveSubcategory(
          context,
          normaliseFlagColor(transaction.flag_color),
        );
        if (!subcategory || subcategory.excludeFromRewards) {
          continue;
        }
        const tier = tierStates.get(subcategory.id);
        if (!tier || tier.rewardRate <= 0) {
          continue;
        }

        if (
          isCapHeadroomExhausted(remainingCardCap, tier.blockSize) ||
          isCapHeadroomExhausted(tier.remainingCap, tier.blockSize)
        ) {
          const standalone = transactionRewards[transaction.id];
          transactionRewards[transaction.id] = {
            ...standalone,
            reward: 0,
            rewardDollars: 0,
            reason: 'cap_reached',
          };
          continue;
        }

        const transactionSpend = Math.abs(transaction.amount) / 1000;
        const spendContribution = Math.min(
          transactionSpend,
          remainingCardCap,
          tier.remainingCap,
        );
        const blockResult = applyBlock(spendContribution, tier.blockSize);
        tier.countedBeforeBlocks += spendContribution;
        tier.counted += blockResult.amount;
        tier.blocks += blockResult.blocks;
        if (hasCardCap) {
          remainingCardCap = Math.max(0, remainingCardCap - blockResult.amount);
        }
        if (tier.maximum) {
          tier.remainingCap = Math.max(0, tier.remainingCap - blockResult.amount);
        }

        const constrained = this.calculateTransactionReward(
          spendContribution,
          calculationCard,
          settings,
          { flagColor: transaction.flag_color },
        );
        transactionRewards[transaction.id] = !tier.minimumMet && constrained.reward > 0
          ? {
              ...constrained,
              reward: 0,
              rewardDollars: 0,
              reason: monthlyQualification.status === 'pending'
                ? 'period_incomplete'
                : 'below_minimum',
            }
          : constrained;
      }

      const earningTiers = [...tierStates.values()].filter(
        ({ subcategory, rewardRate }) => !subcategory.excludeFromRewards && rewardRate > 0,
      );
      const cardCapHit = hasCardCap && earningTiers.length > 0 && earningTiers
        .every(({ blockSize }) => isCapHeadroomExhausted(remainingCardCap, blockSize));
      maximumCapacityExhausted = cardCapHit;
      subcategoryBreakdowns = context.activeSubcategories.map((subcategory) => {
        const tier = tierStates.get(subcategory.id)!;
        const tierEligibleBeforeBlocks = tier.minimumMet ? tier.countedBeforeBlocks : 0;
        const tierEligible = tier.minimumMet ? tier.counted : 0;
        let tierReward = 0;
        let tierRewardDollars = 0;
        if (tier.minimumMet && tier.rewardRate > 0 && tierEligible > 0) {
          if (calculationCard.type === 'cashback') {
            tierReward = tierEligible * (tier.rewardRate / 100);
            tierRewardDollars = tierReward;
          } else {
            tierReward = tierEligible * tier.rewardRate;
            tierRewardDollars = tierReward * milesValuation;
          }
        }

        countedSpend += tier.counted;
        eligibleSpendBeforeBlocks += tierEligibleBeforeBlocks;
        eligibleSpend += tierEligible;
        rewardEarned += tierReward;
        rewardEarnedDollars += tierRewardDollars;

        return {
          id: subcategory.id,
          name: subcategory.name,
          flagColor: subcategory.flagColor,
          totalSpend: tier.total,
          countedSpend: tier.counted,
          eligibleSpendBeforeBlocks: tierEligibleBeforeBlocks,
          eligibleSpend: tierEligible,
          rewardRate: tier.rewardRate,
          rewardEarned: tierReward,
          rewardEarnedDollars: tierRewardDollars,
          minimumSpend: tier.minimum,
          minimumSpendMet: tier.minimumMet,
          maximumSpend: tier.maximum,
          maximumSpendExceeded: (
            tier.maximum !== null && isCapHeadroomExhausted(tier.remainingCap, tier.blockSize)
          ) || (
            !subcategory.excludeFromRewards &&
            hasCardCap &&
            isCapHeadroomExhausted(remainingCardCap, tier.blockSize)
          ),
          blockSize: tier.blockSize,
          blocksEarned: tier.minimumMet && tier.blocks > 0 ? tier.blocks : undefined,
          active: subcategory.active !== false,
          excluded: Boolean(subcategory.excludeFromRewards),
        };
      });
    } else if (!context.enabled) {
      if (typeof calculationCard.earningRate === 'number') {
        const hasCardCap = typeof maximumSpend === 'number' && maximumSpend !== null && maximumSpend > 0;
        const spendCap = hasCardCap ? maximumSpend! : Number.POSITIVE_INFINITY;
        let remainingCap = spendCap;
        const blockSize = getBlockSize(calculationCard);

        for (const txn of periodTransactions) {
          if (isCapHeadroomExhausted(remainingCap, blockSize)) {
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
          if (blockSize) {
            const blocks = Math.floor(spendContribution / blockSize);
            earnablePortion = blocks * blockSize;
          }

          countedSpend += earnablePortion;

          if (minimumSpendMet) {
            eligibleSpendBeforeBlocks += spendContribution;
            eligibleSpend += earnablePortion;
          }

          remainingCap -= earnablePortion;

          const constrained = this.calculateTransactionReward(
            spendContribution,
            calculationCard,
            settings,
            { flagColor: txn.flag_color },
          );
          transactionRewards[txn.id] = !minimumSpendMet && constrained.reward > 0
            ? {
                ...constrained,
                reward: 0,
                rewardDollars: 0,
                reason: monthlyQualification.status === 'pending'
                  ? 'period_incomplete'
                  : 'below_minimum',
              }
              : constrained;
        }

        maximumCapacityExhausted = hasCardCap && isCapHeadroomExhausted(
          remainingCap,
          blockSize,
        );

        if (minimumSpendMet && eligibleSpend > 0) {
          if (calculationCard.type === 'cashback') {
            rewardEarned = eligibleSpend * (calculationCard.earningRate / 100);
            rewardEarnedDollars = rewardEarned;
          } else {
            rewardEarned = eligibleSpend * calculationCard.earningRate;
            rewardEarnedDollars = rewardEarned * milesValuation;
          }
        }
      }
    }

    const maximumSpendExceeded = maximumCapacityExhausted ||
      isMaximumSpendExceeded(countedSpend, maximumSpend);
    const maximumSpendProgress = maximumSpendExceeded
      ? 100
      : calculateMaximumSpendProgress(countedSpend, maximumSpend);

    return {
      cardId: card.id,
      period: period.label,
      totalSpend,
      countedSpend,
      eligibleSpend,
      eligibleSpendBeforeBlocks,
      rewardEarned,
      rewardEarnedDollars,
      rewardType: calculationCard.type,
      minimumSpend,
      minimumSpendMet,
      minimumSpendProgress,
      monthlyMinimumSpend: monthlyQualification.status === 'not_required'
        ? undefined
        : card.rewardPeriod?.monthlyMinimumSpend,
      qualificationStatus: monthlyQualification.status,
      monthlyQualifications: monthlyQualification.breakdowns,
      maximumSpend,
      maximumSpendExceeded,
      maximumSpendProgress,
      subcategoryBreakdowns,
      activeSpendingTierId: resolvedSpendingTier.activeLevel?.id ?? null,
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
    const eligibleCards = cards.filter((card) => (
      (typeof card.earningRate === 'number' && card.earningRate > 0)
      || card.spendingTiers?.some((tier) => (
        typeof tier.earningRate === 'number' && tier.earningRate > 0
      ))
    ));

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
