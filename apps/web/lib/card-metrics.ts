import { SimpleRewardsCalculator, type SimplifiedCalculation, type SimplePeriod } from "@/lib/rewards-engine";
import type { AppSettings, CreditCard } from "@/lib/storage";
import type { Transaction } from "@/types/transaction";
import { formatDateValue } from "@/lib/dashboard-period";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface PrefetchedCardMetrics {
  calculation: SimplifiedCalculation;
  calculationPeriod: SimplePeriod;
  daysRemaining: number;
  period: SimplePeriod;
  transactions: Transaction[];
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
      const periodTransactions = accountTransactions.filter(
        (transaction) =>
          transaction.date >= calculationPeriod.start && transaction.date <= calculationPeriod.end
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
