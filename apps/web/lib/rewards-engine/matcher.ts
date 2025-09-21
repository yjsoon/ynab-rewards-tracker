/**
 * Transaction matching utilities for rewards calculation
 */

import type { Transaction, TransactionWithRewards } from '@/types/transaction';
import { absFromMilli } from '@/lib/utils';

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
   * Filter transactions by date range
   */
  static filterByDateRange(
    transactions: TransactionWithRewards[],
    startDate: Date,
    endDate: Date
  ): TransactionWithRewards[] {
    return transactions.filter(txn => {
      const txnDate = new Date(txn.date);
      return txnDate >= startDate && txnDate <= endDate;
    });
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