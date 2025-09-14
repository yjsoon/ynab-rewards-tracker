/**
 * Transaction matching and tag mapping logic
 */

import type { Transaction, TransactionWithRewards } from '@/types/transaction';
import type { TagMapping } from '@/lib/storage';
import { absFromMilli } from '@/lib/utils';

export class TransactionMatcher {
  /**
   * Apply tag mappings to transactions to determine reward categories
   */
  static applyTagMappings(
    transactions: Transaction[],
    tagMappings: TagMapping[]
  ): TransactionWithRewards[] {
    // Build an index for O(1) lookups; support case-insensitive name matches
    const byTag = new Map<string, string>();
    for (const tm of tagMappings) {
      if (!tm?.ynabTag) continue;
      byTag.set(tm.ynabTag, tm.rewardCategory);
      byTag.set(tm.ynabTag.toLowerCase(), tm.rewardCategory);
    }

    return transactions.map(txn => {
      const colour = txn.flag_color ?? undefined;
      const name = txn.flag_name ?? undefined;
      const rewardCategory =
        (colour && (byTag.get(colour) || byTag.get(colour.toLowerCase()))) ||
        (name && (byTag.get(name) || byTag.get(name.toLowerCase()))) ||
        undefined;

      const enrichedTxn: TransactionWithRewards = {
        ...txn,
        eligibleAmount: txn.amount < 0 ? Math.abs(txn.amount) : 0, // Only outflows (negative amounts)
        rewardCategory,
        appliedRules: [],
        rewardEarned: 0
      };

      return enrichedTxn;
    });
  }

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
   * Group transactions by category
   */
  static groupByCategory(
    transactions: TransactionWithRewards[]
  ): Map<string, TransactionWithRewards[]> {
    const groups = new Map<string, TransactionWithRewards[]>();

    transactions.forEach(txn => {
      const category = txn.rewardCategory || 'uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(txn);
    });

    return groups;
  }

  /**
   * Calculate total spending for a group of transactions
   */
  static calculateTotalSpend(transactions: TransactionWithRewards[]): number {
    return transactions.reduce((total, txn) => total + absFromMilli(txn.amount), 0);
  }

  /**
   * Find transactions that need category assignment
   */
  static findUnmappedTransactions(
    transactions: TransactionWithRewards[]
  ): TransactionWithRewards[] {
    return transactions.filter(txn => 
      txn.amount < 0 && // Only spending
      !txn.rewardCategory && // No category assigned
      (txn.flag_color || txn.flag_name) // Has a flag but no mapping
    );
  }

  /**
   * Get available YNAB tags from transactions
   */
  static getAvailableTags(transactions: Transaction[]): string[] {
    const tags = new Set<string>();
    
    transactions.forEach(txn => {
      if (txn.flag_color) tags.add(txn.flag_color);
      if (txn.flag_name) tags.add(txn.flag_name);
    });

    return Array.from(tags).sort();
  }
}
