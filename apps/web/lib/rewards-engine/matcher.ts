/**
 * Transaction matching and tag mapping logic
 */

import type { Transaction, TransactionWithRewards } from '@/types/transaction';
import type { TagMapping } from '@/lib/storage';

export class TransactionMatcher {
  /**
   * Apply tag mappings to transactions to determine reward categories
   */
  static applyTagMappings(
    transactions: Transaction[],
    tagMappings: TagMapping[]
  ): TransactionWithRewards[] {
    return transactions.map(txn => {
      // Find matching tag mapping
      const mapping = tagMappings.find(tm => {
        // Match by flag color or flag name
        return (
          (txn.flag_color && tm.ynabTag === txn.flag_color) ||
          (txn.flag_name && tm.ynabTag === txn.flag_name)
        );
      });

      const enrichedTxn: TransactionWithRewards = {
        ...txn,
        eligibleAmount: txn.amount < 0 ? Math.abs(txn.amount) : 0, // Only outflows (negative amounts)
        rewardCategory: mapping?.rewardCategory,
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
    return transactions.reduce((total, txn) => {
      return total + Math.abs(txn.amount);
    }, 0) / 1000; // Convert from milliunits to dollars
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