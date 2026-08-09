import { SimpleRewardsCalculator, type SimplifiedCalculation, type SimplePeriod } from "@/lib/rewards-engine";
import {
  createSubcategoryContext,
  normaliseFlagColor,
  resolveSubcategory,
} from "@/lib/rewards-engine/utils/subcategories";
import type { AppSettings, CreditCard } from "@/lib/storage";
import type { Transaction } from "@/types/transaction";
import { formatDateValue } from "@/lib/dashboard-period";
import { hasMinimumSpendRequirement } from "@/lib/minimum-spend-helpers";
import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS } from "@/lib/ynab-constants";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Spend ratio against the cap at which a card is flagged as "near cap". */
export const NEAR_CAP_RATIO = 0.8;

export type CardAttentionStatus =
  | "at-cap"
  | "near-cap"
  | "below-minimum"
  | "earning"
  | "no-limits";

export function cardUsesBlockRounding(card: CreditCard): boolean {
  return Boolean(
    (typeof card.earningBlockSize === "number" && card.earningBlockSize > 0) ||
      (card.subcategoriesEnabled &&
        card.subcategories?.some(
          (subcategory) =>
            typeof subcategory.milesBlockSize === "number" && subcategory.milesBlockSize > 0
        ))
  );
}

/** Spend figure shown against caps: counted spend for block-rounded cards, raw spend otherwise. */
export function getDisplayedSpend(card: CreditCard, calculation: SimplifiedCalculation): number {
  return cardUsesBlockRounding(card) ? calculation.countedSpend : calculation.totalSpend;
}

export function getCardAttentionStatus(
  card: CreditCard,
  calculation: SimplifiedCalculation
): CardAttentionStatus {
  const hasMaximum =
    typeof calculation.maximumSpend === "number" && calculation.maximumSpend > 0;
  const hasMinimum = hasMinimumSpendRequirement(calculation.minimumSpend);

  if (hasMaximum && calculation.maximumSpendExceeded) {
    return "at-cap";
  }
  if (hasMaximum) {
    const spend = getDisplayedSpend(card, calculation);
    if (spend / (calculation.maximumSpend as number) >= NEAR_CAP_RATIO) {
      return "near-cap";
    }
  }
  if (hasMinimum && !calculation.minimumSpendMet) {
    return "below-minimum";
  }
  return hasMaximum || hasMinimum ? "earning" : "no-limits";
}

export interface PrefetchedCardMetrics {
  calculation: SimplifiedCalculation;
  calculationPeriod: SimplePeriod;
  daysRemaining: number;
  period: SimplePeriod;
  transactions: Transaction[];
}

export function filterTransactionsForCardPeriod(
  card: Pick<CreditCard, "ynabAccountId">,
  transactions: Transaction[],
  period: Pick<SimplePeriod, "start" | "end">,
): Transaction[] {
  return transactions.filter(
    (transaction) =>
      transaction.account_id === card.ynabAccountId &&
      transaction.date >= period.start &&
      transaction.date <= period.end,
  );
}

export function filterCardSpendingTransactions(
  card: Pick<CreditCard, "ynabAccountId">,
  transactions: Transaction[],
  period?: Pick<SimplePeriod, "start" | "end">,
): Transaction[] {
  const cardTransactions = period
    ? filterTransactionsForCardPeriod(card, transactions, period)
    : transactions.filter(
        (transaction) => transaction.account_id === card.ynabAccountId,
      );

  return cardTransactions.filter((transaction) => transaction.amount < 0);
}

export function filterTransactionsForSubcategory(
  card: CreditCard,
  transactions: Transaction[],
  subcategoryId: string,
): Transaction[] {
  const context = createSubcategoryContext(card);
  const selectedSubcategory = context.activeSubcategories.find(
    (subcategory) => subcategory.id === subcategoryId,
  );

  if (!selectedSubcategory) {
    return [];
  }

  return transactions.filter((transaction) => (
    resolveSubcategory(context, normaliseFlagColor(transaction.flag_color))?.id
      === selectedSubcategory.id
  ));
}

export function buildRewardCategoryNamesByFlag(
  card: CreditCard,
): Map<string, string> {
  const context = createSubcategoryContext(card);
  const namesByFlag = new Map<string, string>();

  if (!context.enabled) {
    return namesByFlag;
  }

  for (const flag of [UNFLAGGED_FLAG, ...YNAB_FLAG_COLORS]) {
    const category = resolveSubcategory(context, flag.value);
    if (category) {
      namesByFlag.set(flag.value, category.name);
    }
  }

  return namesByFlag;
}

export function buildCardMetricsById(
  cards: CreditCard[],
  transactions: Transaction[],
  settings: AppSettings | undefined,
  referenceDate?: Date
): Record<string, PrefetchedCardMetrics> {
  const anchorDate = referenceDate ?? new Date();
  const asOfDate = formatDateValue(anchorDate);
  const transactionsByAccountId = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    const existing = transactionsByAccountId.get(transaction.account_id);
    if (existing) {
      existing.push(transaction);
      return;
    }

    transactionsByAccountId.set(transaction.account_id, [transaction]);
  });

  return Object.fromEntries(
    cards.map((card) => {
      const period = SimpleRewardsCalculator.calculatePeriod(card, referenceDate);
      const calculationPeriod = {
        ...period,
        end: period.end < asOfDate ? period.end : asOfDate,
      };
      const accountTransactions = transactionsByAccountId.get(card.ynabAccountId) ?? [];
      const periodTransactions = filterTransactionsForCardPeriod(
        card,
        accountTransactions,
        calculationPeriod,
      );
      const calculation = SimpleRewardsCalculator.calculateCardRewards(
        card,
        periodTransactions,
        calculationPeriod,
        settings
      );
      const daysRemaining = Math.max(
        0,
        Math.ceil((new Date(period.end).getTime() - anchorDate.getTime()) / MS_PER_DAY)
      );

      return [
        card.id,
        {
          calculation,
          calculationPeriod,
          daysRemaining,
          period,
          transactions: periodTransactions,
        },
      ];
    })
  );
}
