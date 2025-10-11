/**
 * Transaction matching utilities for rewards calculation
 */

// Transaction types will be provided by the consuming application
export interface Transaction {
  id: string;
  date: string;
  amount: number;
  account_id: string;
  flag_name?: string | null;
  flag_color?: string | null;
  payee_name?: string | null;
  category_name?: string | null;
  approved?: boolean;
  cleared?: string;
}

export interface TransactionWithRewards extends Transaction {
  rewards?: {
    cardId: string;
    amount: number;
    rate: number;
  };
}

function absFromMilli(amount: number): number {
  return Math.abs(amount) / 1000;
}

function parseYnabDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
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
   * Filter transactions by date range
   */
  static filterByDateRange(
    transactions: TransactionWithRewards[],
    startDate: Date,
    endDate: Date
  ): TransactionWithRewards[] {
    return transactions.filter(txn => {
      const txnDate = parseYnabDate(txn.date);
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