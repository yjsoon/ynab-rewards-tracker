import { storage } from '@/storage/service';
import { fetchAccounts, fetchBudgets, fetchTransactions } from './ynab-api';
import type { YnabAccountSummary, YnabBudgetSummary, YnabTransactionSummary } from './ynab-client';

export interface SyncBudgetsAndAccountsOptions {
  pat: string;
  selectedBudgetId?: string;
  trackedAccountIds?: string[];
  onBudgetsFetched?: (budgets: YnabBudgetSummary[]) => void;
  onAccountsFetched?: (accounts: YnabAccountSummary[]) => void;
  onTransactionsFetched?: (transactions: YnabTransactionSummary[]) => void;
  sinceDate?: string;
  skipTransactions?: boolean;
}

export interface SyncBudgetsAndAccountsResult {
  budgets: YnabBudgetSummary[];
  accounts: YnabAccountSummary[];
  transactions: YnabTransactionSummary[];
  budgetId?: string;
}

export class YnabSync {
  async syncBudgetsAndAccounts({
    pat,
    selectedBudgetId,
    trackedAccountIds,
    sinceDate,
    skipTransactions,
    onBudgetsFetched,
    onAccountsFetched,
    onTransactionsFetched,
  }: SyncBudgetsAndAccountsOptions): Promise<SyncBudgetsAndAccountsResult> {
    const budgets = await fetchBudgets(pat);
    onBudgetsFetched?.(budgets);

    const storedSelection = await storage.getSelectedBudget();
    let budgetId = selectedBudgetId || storedSelection.id;

    if (budgetId && !budgets.some((budget) => budget.id === budgetId)) {
      budgetId = undefined;
    }

    if (!budgetId && budgets.length > 0) {
      budgetId = budgets[0].id;
    }

    let accounts: YnabAccountSummary[] = [];
    if (budgetId) {
      accounts = await fetchAccounts(pat, budgetId);
    }

    const sortedAccounts = accounts.sort((a, b) => a.name.localeCompare(b.name));
    onAccountsFetched?.(sortedAccounts);

    let transactions: YnabTransactionSummary[] = [];
    if (budgetId && !skipTransactions) {
      transactions = await fetchTransactions(pat, budgetId, { sinceDate });
      if (trackedAccountIds?.length) {
        const trackedSet = new Set(trackedAccountIds);
        transactions = transactions.filter((txn) => trackedSet.has(txn.account_id));
      }
    }

    onTransactionsFetched?.(transactions);

    return {
      budgets,
      accounts: sortedAccounts,
      transactions,
      budgetId,
    };
  }
}

export const ynabSync = new YnabSync();
