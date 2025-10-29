import {
  YnabClient,
  isYnabApiError,
  type YnabBudgetSummary,
  type YnabAccountSummary,
  type YnabTransactionSummary,
} from './ynab-client';

export interface ValidateTokenResult {
  valid: boolean;
  message?: string;
}

export async function validatePAT(pat: string): Promise<ValidateTokenResult> {
  if (!pat || pat.trim().length === 0) {
    return { valid: false, message: 'Token is required' };
  }

  try {
    const client = new YnabClient(pat.trim());
    await client.getBudgets();
    return { valid: true };
  } catch (error) {
    if (isYnabApiError(error)) {
      if (error.code === 'invalid_token') {
        return { valid: false, message: 'Token is invalid or expired' };
      }
      if (error.code === 'rate_limited') {
        return { valid: false, message: 'Too many requests. Try again shortly.' };
      }
    }

    return { valid: false, message: 'Could not verify token. Check your connection and try again.' };
  }
}

export async function fetchBudgets(pat: string): Promise<YnabBudgetSummary[]> {
  const client = new YnabClient(pat.trim());
  return client.getBudgets();
}

export async function fetchAccounts(pat: string, budgetId: string): Promise<YnabAccountSummary[]> {
  const client = new YnabClient(pat.trim());
  return client.getAccounts(budgetId);
}

export async function fetchTransactions(
  pat: string,
  budgetId: string,
  options: { sinceDate?: string; type?: 'uncategorized' | 'unapproved' } = {},
): Promise<YnabTransactionSummary[]> {
  const client = new YnabClient(pat.trim());
  return client.getTransactions(budgetId, options);
}
