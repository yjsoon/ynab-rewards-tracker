/**
 * Mobile YNAB API client
 *
 * Uses the shared @ynab-counter/ynab-client with mobile-specific configuration
 * (timeout, retries). This wrapper adds account filtering (excludes closed accounts).
 */

import {
  YnabClient as CoreYnabClient,
  YnabApiError,
  isYnabApiError,
  createYnabError,
} from '@ynab-counter/ynab-client';

import type {
  YnabBudgetSummary,
  YnabAccountSummary,
  YnabTransactionSummary,
  YnabTransactionFlagColor,
  YnabApiErrorCode,
} from '@ynab-counter/ynab-client';

// Re-export types for consumers
export type {
  YnabBudgetSummary,
  YnabAccountSummary,
  YnabTransactionSummary,
  YnabTransactionFlagColor,
  YnabApiErrorCode,
};
export { YnabApiError, isYnabApiError, createYnabError };

// Mobile-specific configuration
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 2;
const HOWMUCH_TOKEN_PREFIX = 'howmuch-token:';
const HOWMUCH_API_URL = 'https://howmuch.soon.sg/v1';

type TransactionFilter = {
  sinceDate?: string;
  type?: 'uncategorized' | 'unapproved';
  signal?: AbortSignal;
};

/**
 * Mobile YNAB client with platform-specific timeout and retry settings.
 */
export class YnabClient {
  private readonly coreClient: CoreYnabClient;

  constructor(pat: string) {
    const usesHowMuch = pat.startsWith(HOWMUCH_TOKEN_PREFIX);
    const accessToken = usesHowMuch ? pat.slice(HOWMUCH_TOKEN_PREFIX.length) : pat;
    this.coreClient = new CoreYnabClient({
      accessToken,
      baseUrl: usesHowMuch ? HOWMUCH_API_URL : undefined,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxRetries: MAX_RETRY_ATTEMPTS,
      paginateTransactions: usesHowMuch,
    });
  }

  async getBudgets(): Promise<YnabBudgetSummary[]> {
    return this.coreClient.getBudgets();
  }

  async getAccounts(budgetId: string): Promise<YnabAccountSummary[]> {
    const accounts = await this.coreClient.getAccounts(budgetId);
    // Mobile filters out closed accounts by default
    return accounts.filter((account) => !account.closed);
  }

  async getTransactions(
    budgetId: string,
    options: TransactionFilter = {},
  ): Promise<YnabTransactionSummary[]> {
    return this.coreClient.getTransactions(budgetId, {
      sinceDate: options.sinceDate,
      type: options.type,
      signal: options.signal,
    });
  }

  async validateToken(): Promise<boolean> {
    return this.coreClient.validateToken();
  }

  async updateTransactionFlag(
    budgetId: string,
    transactionId: string,
    flagColor: YnabTransactionFlagColor,
  ): Promise<YnabTransactionSummary | undefined> {
    return this.coreClient.updateTransactionFlag(budgetId, transactionId, flagColor);
  }
}
