/**
 * Transaction matching utilities for rewards calculation
 */

import { formatLocalDate } from './date-utils';
import type { Transaction, TransactionWithRewards } from '../storage/types';

function absFromMilli(amount: number): number {
  return Math.abs(amount) / 1000;
}

export class TransactionMatcher {
  /**
   * Filter transactions for a specific card account
   */
  static filterForCard(
    transactions: TransactionWithRewards[],
    cardAccountId: string
  ): TransactionWithRewards[] {
    return transactions.filter(txn =>
      txn.account_id === cardAccountId &&
      txn.amount < 0 // Only outflows (spending)
    );
  }

  /**
   * Filter transactions by date range. YNAB stores dates as YYYY-MM-DD strings,
   * which compare lexicographically in the same order as Date objects, so we
   * convert the bounds once and skip per-transaction Date parsing.
   */
  static filterByDateRange(
    transactions: TransactionWithRewards[],
    startDate: Date,
    endDate: Date
  ): TransactionWithRewards[] {
    const startStr = formatLocalDate(startDate);
    const endStr = formatLocalDate(endDate);
    return transactions.filter(txn => txn.date >= startStr && txn.date <= endStr);
  }

  /**
   * Calculate total spend from transactions
   */
  static calculateTotalSpend(transactions: TransactionWithRewards[]): number {
    return transactions.reduce((total, txn) => total + absFromMilli(txn.amount), 0);
  }

  /**
   * Get available YNAB tags/flags from transactions
   */
  static getAvailableTags(transactions: Transaction[]): string[] {
    const tags = new Set<string>();
    for (const txn of transactions) {
      if (txn.flag_name) {
        tags.add(txn.flag_name);
      } else if (txn.flag_color) {
        tags.add(txn.flag_color);
      }
    }
    return Array.from(tags).sort();
  }
}