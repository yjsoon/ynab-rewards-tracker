import { normalizePeriod } from '../storage/helpers';
import type {
  AppSettings,
  CreditCard,
  RewardCalculation,
  Transaction,
} from '../storage/types';
import { formatLocalDate, parseYnabDate } from './date-utils';
import {
  SimpleRewardsCalculator,
  type CalculationPeriod,
  type SimplifiedCalculation,
  type TransactionRewardBlock,
  type TransactionRewardReason,
  type TransactionRewardResult,
} from './simple-calculator';
import {
  isSpendingTierCalculationCompatible,
  resolveCardSpendingTier,
} from './utils/spending-tiers';

const MILLIUNITS_PER_UNIT = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Spend ratio against a maximum at which a card needs attention. */
export const NEAR_CAP_RATIO = 0.8;

export type CardPortfolioStatus =
  | 'unconfigured'
  | 'building'
  | 'earning'
  | 'near_cap'
  | 'capped'
  | 'open';

export interface CardRewardProjection {
  type: CreditCard['type'];
  /** Cashback dollars or native miles, according to `type`. */
  amount: number;
  /** Cross-card value after applying the configured miles valuation. */
  dollars: number;
}

export interface SpendProjection {
  /** Raw outgoing spend in the period. */
  total: number;
  /** Spend retained after caps and block rounding. */
  counted: number;
  /** Spend that currently earns rewards after minimum requirements. */
  eligible: number;
}

export interface ThresholdProjection {
  target: number | null;
  remaining: number | null;
  progress: number | null;
  met: boolean | null;
}

export interface MaximumThresholdProjection extends ThresholdProjection {
  over: number | null;
  reached: boolean;
}

/**
 * Values a combined minimum/maximum progress component needs. Minimums use raw
 * spend while maximums use block-rounded spend when a card earns in blocks.
 */
export interface CardProgressProjection {
  minimumSpend: number | null;
  maximumSpend: number | null;
  minimumProgressSpend: number;
  maximumProgressSpend: number;
  minimumProgress: number | null;
  maximumProgress: number | null;
}

export interface CardBlockProjection {
  sizes: number[];
  eligibleSpendBeforeBlocks: number;
  eligibleSpendAfterBlocks: number;
  uncountedEligibleSpend: number;
  blocksEarned: number | null;
}

export interface RewardCategoryBlockProjection {
  size: number;
  eligibleSpendBeforeBlocks: number;
  eligibleSpendAfterBlocks: number;
  uncountedEligibleSpend: number;
  blocksEarned: number;
}

/**
 * Exact period state for one card-specific reward tier. These are YNAB flag
 * tiers configured on a card, not YNAB budget categories, so callers must keep
 * the owning card identity when combining them into a portfolio view.
 */
export interface RewardCategoryProjection {
  id: string;
  name: string;
  flagColor: NonNullable<CreditCard['subcategories']>[number]['flagColor'];
  priority: number;
  spend: SpendProjection;
  /** Share of visible tier spend, including tiers excluded from rewards. */
  shareOfBreakdownSpend: number;
  reward: CardRewardProjection;
  rate: number;
  minimum: ThresholdProjection;
  maximum: MaximumThresholdProjection;
  blockInfo: RewardCategoryBlockProjection | null;
  excluded: boolean;
  blockedByCardMinimum: boolean;
}

export interface CardDashboardProjection {
  card: CreditCard;
  accountId: string;
  period: CalculationPeriod;
  /** Period bounded by the reference date, used for `calculation`. */
  calculationPeriod: CalculationPeriod;
  calculation: SimplifiedCalculation;
  reward: CardRewardProjection;
  rewardCategories: RewardCategoryProjection[];
  spend: SpendProjection;
  minimum: ThresholdProjection;
  maximum: MaximumThresholdProjection;
  progress: CardProgressProjection;
  blockInfo: CardBlockProjection | null;
  status: CardPortfolioStatus;
  daysRemaining: number;
  resetsOn: string;
}

export type CardStatusCounts = Record<CardPortfolioStatus, number>;

export interface RewardsPortfolioTotals {
  cardCount: number;
  spend: number;
  countedSpend: number;
  eligibleSpend: number;
  normalizedRewardDollars: number;
  nativeRewards: {
    cashback: number;
    miles: number;
  };
  statusCounts: CardStatusCounts;
}

export interface RewardsDashboardProjection {
  asOf: string;
  cards: CardDashboardProjection[];
  totals: RewardsPortfolioTotals;
}

export type TransactionProjectionStatus =
  | 'incoming'
  | 'no_card'
  | 'no_reward'
  | 'earning';

export interface TransactionRewardProjection {
  type: CreditCard['type'] | null;
  rate: number;
  /** Cashback dollars or native miles, according to `type`. */
  amount: number;
  dollars: number;
}

export interface TransactionProjection {
  transaction: Transaction;
  account: {
    id: string;
    name: string | null;
  };
  card: CreditCard | null;
  amount: number;
  status: TransactionProjectionStatus;
  noRewardReason: TransactionRewardReason | null;
  reward: TransactionRewardProjection;
  blockInfo: TransactionRewardBlock | null;
}

export type AccountNameLookup =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>;

export interface TransactionProjectionOptions {
  periodDataComplete?: boolean;
  /** Earliest transaction date represented by the supplied cache window. */
  periodDataSinceDate?: string;
}

/**
 * Project configured reward tiers into a stable UI model without mutating the
 * card or calculator output. Configuration priority is preserved.
 */
export function projectRewardCategories(
  card: CreditCard,
  calculation: SimplifiedCalculation,
): RewardCategoryProjection[] {
  if (!card.subcategoriesEnabled || !card.subcategories?.length) {
    return [];
  }

  const calculationsById = new Map(
    calculation.subcategoryBreakdowns?.map((entry) => [entry.id, entry] as const) ?? [],
  );
  const configuredCategories = [...card.subcategories]
    .filter((category) => category.active !== false)
    .sort((left, right) => left.priority - right.priority);
  const totalBreakdownSpend = configuredCategories.reduce(
    (total, category) => total + (calculationsById.get(category.id)?.totalSpend ?? 0),
    0,
  );
  const cardMinimumBlocksRewards = hasPositiveThreshold(calculation.minimumSpend) &&
    !calculation.minimumSpendMet;

  return configuredCategories.map((category) => {
    const categoryCalculation = calculationsById.get(category.id);
    const totalSpend = categoryCalculation?.totalSpend ?? 0;
    const countedSpend = categoryCalculation?.countedSpend ?? 0;
    const eligibleSpend = categoryCalculation?.eligibleSpend ?? 0;
    const minimumTarget = hasPositiveThreshold(category.minimumSpend)
      ? category.minimumSpend
      : null;
    const configuredMaximum = categoryCalculation?.maximumSpend !== undefined
      ? categoryCalculation.maximumSpend
      : category.maximumSpend;
    const maximumTarget = hasPositiveThreshold(configuredMaximum)
      ? configuredMaximum
      : null;
    const minimumMet = minimumTarget === null ? null : totalSpend >= minimumTarget;
    const configuredBlockSize = categoryCalculation !== undefined
      ? categoryCalculation.blockSize
      : card.type === 'miles'
        ? category.milesBlockSize ?? card.earningBlockSize
        : null;
    const blockSize = hasPositiveThreshold(configuredBlockSize)
      ? configuredBlockSize
      : null;
    const maximumProgressSpend = blockSize !== null
      ? countedSpend
      : totalSpend;
    const maximumReached = categoryCalculation?.maximumSpendExceeded ?? (
      maximumTarget !== null && maximumProgressSpend >= maximumTarget
    );
    const eligibleSpendBeforeBlocks = categoryCalculation?.eligibleSpendBeforeBlocks ?? 0;

    return {
      id: category.id,
      name: category.name,
      flagColor: category.flagColor,
      priority: category.priority,
      spend: {
        total: totalSpend,
        counted: countedSpend,
        eligible: eligibleSpend,
      },
      shareOfBreakdownSpend: totalBreakdownSpend > 0
        ? totalSpend / totalBreakdownSpend
        : 0,
      reward: {
        type: calculation.rewardType,
        amount: categoryCalculation?.rewardEarned ?? 0,
        dollars: categoryCalculation?.rewardEarnedDollars ?? 0,
      },
      rate: categoryCalculation?.rewardRate ?? (category.excludeFromRewards ? 0 : category.rewardValue),
      minimum: {
        target: minimumTarget,
        remaining: minimumTarget === null
          ? null
          : Math.max(0, minimumTarget - totalSpend),
        progress: minimumTarget === null
          ? null
          : Math.min(1, totalSpend / minimumTarget),
        met: minimumMet,
      },
      maximum: {
        target: maximumTarget,
        remaining: maximumTarget === null
          ? null
          : maximumReached
            ? 0
            : Math.max(0, maximumTarget - maximumProgressSpend),
        over: maximumTarget === null
          ? null
          : Math.max(0, maximumProgressSpend - maximumTarget),
        progress: maximumTarget === null
          ? null
          : maximumReached
            ? 1
            : Math.min(1, maximumProgressSpend / maximumTarget),
        met: maximumTarget === null && !maximumReached ? null : maximumReached,
        reached: maximumReached,
      },
      blockInfo: blockSize === null
        ? null
        : {
            size: blockSize,
            eligibleSpendBeforeBlocks,
            eligibleSpendAfterBlocks: eligibleSpend,
            uncountedEligibleSpend: Math.max(
              0,
              eligibleSpendBeforeBlocks - eligibleSpend,
            ),
            blocksEarned: categoryCalculation?.blocksEarned ?? 0,
          },
      excluded: Boolean(category.excludeFromRewards),
      blockedByCardMinimum: !category.excludeFromRewards && cardMinimumBlocksRewards,
    };
  });
}

function createStatusCounts(): CardStatusCounts {
  return {
    unconfigured: 0,
    building: 0,
    earning: 0,
    near_cap: 0,
    capped: 0,
    open: 0,
  };
}

function hasPositiveThreshold(value: number | null | undefined): value is number {
  return typeof value === 'number' && value > 0;
}

function hasEarningConfiguration(card: CreditCard): boolean {
  if (
    typeof card.earningRate === 'number'
    || card.spendingTiers?.some((tier) => typeof tier.earningRate === 'number')
  ) {
    return true;
  }

  return Boolean(
    card.subcategoriesEnabled &&
      card.subcategories?.some(
        (subcategory) =>
          subcategory.active !== false &&
          !subcategory.excludeFromRewards &&
          typeof subcategory.rewardValue === 'number',
      ),
  );
}

function getBlockSizes(card: CreditCard): number[] {
  const sizes = new Set<number>();

  if (hasPositiveThreshold(card.earningBlockSize)) {
    sizes.add(card.earningBlockSize);
  }

  if (card.type === 'miles' && card.subcategoriesEnabled) {
    for (const subcategory of card.subcategories ?? []) {
      if (
        subcategory.active !== false &&
        !subcategory.excludeFromRewards &&
        hasPositiveThreshold(subcategory.milesBlockSize)
      ) {
        sizes.add(subcategory.milesBlockSize);
      }
    }
  }

  return [...sizes].sort((left, right) => left - right);
}

function getBlocksEarned(
  calculation: SimplifiedCalculation,
  blockSizes: number[],
): number | null {
  const subcategoryBlocks = calculation.subcategoryBreakdowns?.reduce(
    (total, subcategory) => total + (subcategory.blocksEarned ?? 0),
    0,
  );

  if (subcategoryBlocks) {
    return subcategoryBlocks;
  }

  if (blockSizes.length === 1 && calculation.eligibleSpend > 0) {
    return Math.floor(calculation.eligibleSpend / blockSizes[0]);
  }

  return null;
}

function findPersistedCalculation(
  card: CreditCard,
  period: CalculationPeriod,
  calculations: readonly RewardCalculation[],
): RewardCalculation | undefined {
  const matches = calculations.filter((candidate) => {
    if (candidate.cardId !== card.id) {
      return false;
    }
    const normalized = normalizePeriod(candidate.period);
    return normalized.start === period.start && normalized.end === period.end;
  });
  return matches.find(({ ruleId }) => ruleId === `card-${card.id}`) ??
    (matches.length === 1 ? matches[0] : undefined);
}

function applyPersistedCalculation(
  card: CreditCard,
  calculation: SimplifiedCalculation,
  persisted: RewardCalculation | undefined,
  settings: AppSettings,
  asOf: string,
): SimplifiedCalculation {
  if (!persisted) {
    return calculation;
  }
  if (!isSpendingTierCalculationCompatible(card, persisted)) {
    return calculation;
  }
  if (
    card.rewardPeriod &&
    card.rewardPeriod.monthlyMinimumSpend > 0 &&
    (
      persisted.qualificationStatus === undefined ||
      !persisted.monthlyQualifications?.length
    )
  ) {
    return calculation;
  }

  const today = formatLocalDate(new Date());
  const persistedMonthlyQualifications = persisted.monthlyQualifications?.map((month) => ({
    ...month,
    status: month.spend >= month.minimumSpend
      ? 'met' as const
      : month.end < asOf || (month.end === asOf && asOf < today)
        ? 'failed' as const
        : 'pending' as const,
  }));
  const persistedQualificationStatus = persistedMonthlyQualifications?.some(
    (month) => month.status === 'failed',
  )
    ? 'failed' as const
    : persistedMonthlyQualifications?.every((month) => month.status === 'met')
      ? 'met' as const
      : persistedMonthlyQualifications?.length
        ? 'pending' as const
        : calculation.qualificationStatus;
  const persistedActiveMonth = persistedMonthlyQualifications?.find(
    (month) => month.start <= asOf && month.end >= asOf,
  );

  const persistedSubcategories = new Map(
    persisted.subcategoryBreakdowns?.map((entry) => [entry.subcategoryId, entry] as const) ?? [],
  );
  const configuredMaximumSpend = persisted.maximumSpend !== undefined
    ? persisted.maximumSpend
    : calculation.maximumSpend;
  const maximumSpend = hasPositiveThreshold(configuredMaximumSpend)
    ? configuredMaximumSpend
    : null;
  const maximumProgress = typeof persisted.maximumProgress === 'number'
    ? persisted.maximumProgress
    : undefined;
  const countedSpend = persisted.countedSpend ?? (
    maximumSpend !== null && maximumProgress !== undefined
      ? maximumSpend * Math.min(1, Math.max(0, maximumProgress / 100))
      : persisted.minimumMet
        ? persisted.eligibleSpend
        : persisted.totalSpend
  );
  const rewardEarnedDollars = card.type === 'cashback'
    ? persisted.rewardEarned
    : persisted.rewardEarned * (settings.milesValuation ?? 0.01);

  return {
    ...calculation,
    totalSpend: persisted.totalSpend,
    countedSpend,
    eligibleSpend: persisted.eligibleSpend,
    eligibleSpendBeforeBlocks: persisted.eligibleSpendBeforeBlocks ?? persisted.eligibleSpend,
    rewardEarned: persisted.rewardEarned,
    rewardEarnedDollars,
    minimumSpend: persisted.minimumSpend !== undefined
      ? persisted.minimumSpend
      : calculation.minimumSpend,
    minimumSpendMet: card.rewardPeriod && card.rewardPeriod.monthlyMinimumSpend > 0
      ? persistedQualificationStatus === 'met' && persisted.minimumMet
      : persisted.minimumMet,
    minimumSpendProgress: persistedActiveMonth
      ? Math.min(100, (persistedActiveMonth.spend / persistedActiveMonth.minimumSpend) * 100)
      : persisted.minimumProgress,
    // Keep persisted spend when it fills a truncated live cache, but derive
    // statuses again for this view date so pending months cannot freeze.
    monthlyMinimumSpend: persisted.monthlyMinimumSpend ?? calculation.monthlyMinimumSpend,
    qualificationStatus: persistedQualificationStatus,
    monthlyQualifications: persistedMonthlyQualifications ?? calculation.monthlyQualifications,
    maximumSpend: persisted.maximumSpend !== undefined
      ? persisted.maximumSpend
      : calculation.maximumSpend,
    maximumSpendExceeded: persisted.maximumExceeded,
    maximumSpendProgress: persisted.maximumProgress,
    activeSpendingTierId: persisted.activeSpendingTierId !== undefined
      ? persisted.activeSpendingTierId
      : calculation.activeSpendingTierId,
    subcategoryBreakdowns: calculation.subcategoryBreakdowns?.map((subcategory) => {
      const complete = persistedSubcategories.get(subcategory.id);
      if (!complete) {
        return subcategory;
      }
      return {
        ...subcategory,
        totalSpend: complete.totalSpend,
        countedSpend: complete.countedSpend ?? complete.eligibleSpend,
        eligibleSpendBeforeBlocks: complete.eligibleSpendBeforeBlocks ?? complete.eligibleSpend,
        eligibleSpend: complete.eligibleSpend,
        rewardEarned: complete.rewardEarned,
        rewardEarnedDollars: card.type === 'cashback'
          ? complete.rewardEarned
          : complete.rewardEarned * (settings.milesValuation ?? 0.01),
        rewardRate: complete.rewardRate ?? subcategory.rewardRate,
        minimumSpend: complete.minimumSpend !== undefined
          ? complete.minimumSpend
          : subcategory.minimumSpend,
        minimumSpendMet: complete.minimumSpendMet,
        maximumSpend: complete.maximumSpend !== undefined
          ? complete.maximumSpend
          : subcategory.maximumSpend,
        maximumSpendExceeded: complete.maximumSpendExceeded,
        blockSize: complete.blockSize ?? subcategory.blockSize,
        blocksEarned: complete.blocksEarned ?? subcategory.blocksEarned,
      };
    }),
  };
}

function getStatus(params: {
  configured: boolean;
  hasMinimum: boolean;
  minimumMet: boolean;
  hasMaximum: boolean;
  maximumReached: boolean;
  maximumProgress: number | null;
}): CardPortfolioStatus {
  if (!params.configured) {
    return 'unconfigured';
  }
  if (params.maximumReached) {
    return 'capped';
  }
  if (
    params.hasMaximum &&
    params.maximumProgress !== null &&
    params.maximumProgress >= NEAR_CAP_RATIO
  ) {
    return 'near_cap';
  }
  if (params.hasMinimum && !params.minimumMet) {
    return 'building';
  }
  if (params.hasMinimum || params.hasMaximum) {
    return 'earning';
  }
  return 'open';
}

function addOneDay(dateString: string): string {
  const date = parseYnabDate(dateString);
  date.setDate(date.getDate() + 1);
  return formatLocalDate(date);
}

function lookupAccountName(
  accountNames: AccountNameLookup | undefined,
  accountId: string,
): string | null {
  if (!accountNames) {
    return null;
  }

  if (accountNames instanceof Map) {
    return accountNames.get(accountId) ?? null;
  }

  return (accountNames as Readonly<Record<string, string>>)[accountId] ?? null;
}

/**
 * Build the complete, deterministic dashboard model for one reference date.
 * Transactions after that date are deliberately excluded from the calculation.
 */
export function buildRewardsDashboard(
  cards: CreditCard[],
  transactions: Transaction[],
  settings: AppSettings = {},
  referenceDate: Date = new Date(),
  persistedCalculations: readonly RewardCalculation[] = [],
): RewardsDashboardProjection {
  const asOf = formatLocalDate(referenceDate);
  const transactionsByAccount = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const accountTransactions = transactionsByAccount.get(transaction.account_id);
    if (accountTransactions) {
      accountTransactions.push(transaction);
    } else {
      transactionsByAccount.set(transaction.account_id, [transaction]);
    }
  }

  const projectedCards = cards.map<CardDashboardProjection>((card) => {
    const period = SimpleRewardsCalculator.calculatePeriod(card, referenceDate);
    const calculationPeriod: CalculationPeriod = {
      ...period,
      end: period.end < asOf ? period.end : asOf,
      asOf,
    };
    const periodTransactions = (transactionsByAccount.get(card.ynabAccountId) ?? []).filter(
      (transaction) =>
        transaction.date >= calculationPeriod.start &&
        transaction.date <= calculationPeriod.end,
    );
    const cachedCalculation = SimpleRewardsCalculator.calculateCardRewards(
      card,
      periodTransactions,
      calculationPeriod,
      settings,
    );
    const persistedCalculation = (
      calculationPeriod.end === period.end ||
      asOf === formatLocalDate(new Date())
    )
      ? findPersistedCalculation(card, period, persistedCalculations)
      : undefined;
    const calculation = applyPersistedCalculation(
      card,
      cachedCalculation,
      persistedCalculation,
      settings,
      asOf,
    );
    const blockSizes = getBlockSizes(card);
    const usesBlocks = blockSizes.length > 0;
    const maximumProgressSpend = usesBlocks
      ? calculation.countedSpend
      : calculation.totalSpend;
    const activeMonthlyQualification = calculation.monthlyQualifications?.find(
      (month) => month.start <= asOf && month.end >= asOf,
    );
    const configuredMinimum = activeMonthlyQualification?.minimumSpend
      ?? calculation.minimumSpend;
    const configuredMaximum = calculation.maximumSpend;
    const hasMinimum = hasPositiveThreshold(configuredMinimum);
    const hasMaximum = hasPositiveThreshold(configuredMaximum);
    const minimumTarget = hasMinimum ? configuredMinimum : null;
    const maximumTarget = hasMaximum ? configuredMaximum : null;
    const minimumProgressSpend = activeMonthlyQualification?.spend
      ?? calculation.totalSpend;
    const minimumProgress = minimumTarget
      ? Math.min(1, minimumProgressSpend / minimumTarget)
      : null;
    const maximumProgress = maximumTarget
      ? calculation.maximumSpendExceeded
        ? 1
        : Math.min(1, maximumProgressSpend / maximumTarget)
      : null;
    const maximumReached = maximumTarget !== null && calculation.maximumSpendExceeded;
    const canUnlockHigherSpendingLevel = resolveCardSpendingTier(
      card,
      calculation.totalSpend,
    ).hasNextSpendingTier;
    const minimumMet = minimumTarget !== null
      ? activeMonthlyQualification
        ? activeMonthlyQualification.status === 'met'
        : calculation.minimumSpendMet
      : null;
    const eligibleSpendBeforeBlocks = calculation.eligibleSpendBeforeBlocks
      ?? calculation.eligibleSpend;
    const status = getStatus({
      configured: hasEarningConfiguration(card),
      hasMinimum,
      minimumMet: calculation.qualificationStatus === 'failed'
        ? false
        : minimumMet ?? true,
      hasMaximum,
      maximumReached: maximumReached && !canUnlockHigherSpendingLevel,
      maximumProgress: canUnlockHigherSpendingLevel ? null : maximumProgress,
    });
    const resetsOn = addOneDay(period.end);
    const resetDate = parseYnabDate(resetsOn);

    return {
      card,
      accountId: card.ynabAccountId,
      period,
      calculationPeriod,
      calculation,
      reward: {
        type: calculation.rewardType,
        amount: calculation.rewardEarned,
        dollars: calculation.rewardEarnedDollars,
      },
      rewardCategories: projectRewardCategories(card, calculation),
      spend: {
        total: calculation.totalSpend,
        counted: calculation.countedSpend,
        eligible: calculation.eligibleSpend,
      },
      minimum: {
        target: minimumTarget,
        remaining: minimumTarget === null
          ? null
          : Math.max(0, minimumTarget - minimumProgressSpend),
        progress: minimumProgress,
        met: minimumMet,
      },
      maximum: {
        target: maximumTarget,
        remaining: maximumTarget === null
          ? null
          : maximumReached
            ? 0
            : Math.max(0, maximumTarget - maximumProgressSpend),
        over: maximumTarget === null
          ? null
          : Math.max(0, maximumProgressSpend - maximumTarget),
        progress: maximumProgress,
        met: maximumTarget === null ? null : maximumReached,
        reached: maximumReached,
      },
      progress: {
        minimumSpend: minimumTarget,
        maximumSpend: maximumTarget,
        minimumProgressSpend,
        maximumProgressSpend,
        minimumProgress,
        maximumProgress,
      },
      blockInfo: usesBlocks
        ? {
            sizes: blockSizes,
            eligibleSpendBeforeBlocks,
            eligibleSpendAfterBlocks: calculation.eligibleSpend,
            uncountedEligibleSpend: Math.max(
              0,
              eligibleSpendBeforeBlocks - calculation.eligibleSpend,
            ),
            blocksEarned: getBlocksEarned(calculation, blockSizes),
          }
        : null,
      status,
      daysRemaining: Math.max(
        0,
        Math.ceil((resetDate.getTime() - referenceDate.getTime()) / MS_PER_DAY),
      ),
      resetsOn,
    };
  });

  const statusCounts = createStatusCounts();
  const totals = projectedCards.reduce<RewardsPortfolioTotals>(
    (aggregate, card) => {
      aggregate.cardCount += 1;
      aggregate.spend += card.spend.total;
      aggregate.countedSpend += card.spend.counted;
      aggregate.eligibleSpend += card.spend.eligible;
      aggregate.normalizedRewardDollars += card.reward.dollars;
      aggregate.nativeRewards[card.reward.type] += card.reward.amount;
      aggregate.statusCounts[card.status] += 1;
      return aggregate;
    },
    {
      cardCount: 0,
      spend: 0,
      countedSpend: 0,
      eligibleSpend: 0,
      normalizedRewardDollars: 0,
      nativeRewards: {
        cashback: 0,
        miles: 0,
      },
      statusCounts,
    },
  );

  return {
    asOf,
    cards: projectedCards,
    totals,
  };
}

/** Alias that describes the same projection in portfolio-oriented callers. */
export const projectRewardsPortfolio = buildRewardsDashboard;

/**
 * Annotate transactions without mutating or filtering them. Complete periods use
 * the period-aware card calculation so retroactive spend tiers stay consistent.
 */
export function projectTransactions(
  transactions: Transaction[],
  cards: CreditCard[],
  settings: AppSettings = {},
  accountNames?: AccountNameLookup,
  options: TransactionProjectionOptions = {},
): TransactionProjection[] {
  const cardsByAccount = new Map(
    cards.map((card) => [card.ynabAccountId, card] as const),
  );
  const periodRewards = new Map<string, TransactionRewardResult>();
  const periodCompleteness = new Map<string, boolean>();

  for (const card of cards) {
    const transactionsByPeriod = new Map<
      string,
      { period: CalculationPeriod; transactions: Transaction[] }
    >();
    for (const transaction of transactions) {
      if (transaction.account_id !== card.ynabAccountId || transaction.amount >= 0) {
        continue;
      }
      const period = SimpleRewardsCalculator.calculatePeriod(
        card,
        parseYnabDate(transaction.date),
      );
      const periodIsComplete = options.periodDataComplete !== false && (
        !options.periodDataSinceDate || period.start >= options.periodDataSinceDate
      );
      periodCompleteness.set(`${card.id}:${transaction.id}`, periodIsComplete);
      if (!periodIsComplete) {
        continue;
      }
      const existing = transactionsByPeriod.get(period.start);
      if (existing) {
        existing.transactions.push(transaction);
      } else {
        transactionsByPeriod.set(period.start, { period, transactions: [transaction] });
      }
    }

    for (const { period, transactions: periodTransactions } of transactionsByPeriod.values()) {
      const calculation = SimpleRewardsCalculator.calculateCardRewards(
        card,
        periodTransactions,
        period,
        settings,
      );
      for (const transaction of periodTransactions) {
        const reward = calculation.transactionRewards[transaction.id];
        if (reward) {
          periodRewards.set(`${card.id}:${transaction.id}`, reward);
        }
      }
    }
  }

  return transactions.map((transaction) => {
    const card = cardsByAccount.get(transaction.account_id) ?? null;
    const amount = Math.abs(transaction.amount) / MILLIUNITS_PER_UNIT;
    const incoming = transaction.amount > 0;
    const calculatedReward = !incoming && card
      ? periodRewards.get(`${card.id}:${transaction.id}`) ??
        SimpleRewardsCalculator.calculateTransactionReward(amount, card, settings, {
          flagColor: transaction.flag_color,
        })
      : null;
    const periodIsComplete = card
      ? periodCompleteness.get(`${card.id}:${transaction.id}`) ?? true
      : true;
    const rewardResult = calculatedReward &&
      !periodIsComplete &&
      calculatedReward.reward > 0
      ? {
          ...calculatedReward,
          reward: 0,
          rewardDollars: 0,
          reason: 'period_incomplete' as const,
        }
      : calculatedReward;
    const status: TransactionProjectionStatus = incoming
      ? 'incoming'
      : !card
        ? 'no_card'
        : rewardResult && rewardResult.reward > 0
          ? 'earning'
          : 'no_reward';

    return {
      transaction,
      account: {
        id: transaction.account_id,
        name: lookupAccountName(accountNames, transaction.account_id),
      },
      card,
      amount,
      status,
      noRewardReason: status === 'no_reward'
        ? rewardResult?.reason ?? 'zero_amount'
        : null,
      reward: {
        type: card?.type ?? null,
        rate: rewardResult?.rewardRate ?? 0,
        amount: rewardResult?.reward ?? 0,
        dollars: rewardResult?.rewardDollars ?? 0,
      },
      blockInfo: rewardResult?.block ?? null,
    };
  });
}

export const buildTransactionProjections = projectTransactions;
