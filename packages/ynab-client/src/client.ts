/**
 * Platform-agnostic YNAB API client.
 */

import { isYnabApiError } from './errors';
import { requestJson, DEFAULT_BASE_URL } from './request';
import type { RequestOptions } from './request';
import type {
  YnabApiResponse,
  YnabBudgetSummary,
  YnabAccountSummary,
  YnabCategoryGroup,
  YnabPayee,
  YnabSaveTransactionsData,
  YnabTransactionFlagColor,
  YnabTransactionSummary,
} from './types';

export interface YnabClientOptions {
  /** YNAB Personal Access Token */
  accessToken: string;
  /** Base URL for API requests (default: https://api.ynab.com/v1) */
  baseUrl?: string;
  /** Custom fetch implementation */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds (undefined = no timeout) */
  timeoutMs?: number;
  /** Max retries for rate limiting and network errors (default: 0) */
  maxRetries?: number;
  /** Custom backoff function */
  backoffMs?: RequestOptions['backoffMs'];
}

export interface ListOptions {
  /** Last known server knowledge for delta requests */
  lastKnowledgeOfServer?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface TransactionFilterOptions extends ListOptions {
  /** Only return transactions on or after this date (YYYY-MM-DD) */
  sinceDate?: string;
  /** Filter by transaction type */
  type?: 'uncategorized' | 'unapproved';
}

type ClientRequestOptions = Pick<
  RequestOptions,
  'body' | 'headers' | 'method' | 'signal'
>;

/**
 * YNAB API client with standardised error handling.
 * 
 * @example
 * ```ts
 * const client = new YnabClient({ accessToken: 'your-token' });
 * const budgets = await client.getBudgets();
 * ```
 */
export class YnabClient {
  private readonly options: Required<Pick<YnabClientOptions, 'accessToken' | 'baseUrl'>> & 
    Omit<YnabClientOptions, 'accessToken' | 'baseUrl'>;

  constructor(options: YnabClientOptions) {
    this.options = {
      ...options,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    };
  }

  /**
   * Get all plans for the authenticated user.
   *
   * The method keeps the app's existing "budget" terminology stable while
   * using YNAB's current /plans API on the wire.
   */
  async getBudgets(options?: { signal?: AbortSignal }): Promise<YnabBudgetSummary[]> {
    const response = await this.request<
      YnabApiResponse<{ plans?: YnabBudgetSummary[]; budgets?: YnabBudgetSummary[] }>
    >(
      '/plans',
      options,
    );
    return extractPlans(response.data);
  }

  /**
   * Get all accounts for a plan.
   */
  async getAccounts(budgetId: string, options?: ListOptions): Promise<YnabAccountSummary[]> {
    const path = buildPath(`/plans/${budgetId}/accounts`, options);
    const response = await this.request<YnabApiResponse<{ accounts: YnabAccountSummary[] }>>(
      path,
      options,
    );
    return response.data.accounts;
  }

  /**
   * Get all category groups and categories for a plan.
   */
  async getCategories(budgetId: string, options?: ListOptions): Promise<YnabCategoryGroup[]> {
    const path = buildPath(`/plans/${budgetId}/categories`, options);
    const response = await this.request<YnabApiResponse<{ category_groups: YnabCategoryGroup[] }>>(
      path,
      options,
    );
    return response.data.category_groups;
  }

  /**
   * Get all payees for a plan.
   */
  async getPayees(budgetId: string, options?: ListOptions): Promise<YnabPayee[]> {
    const path = buildPath(`/plans/${budgetId}/payees`, options);
    const response = await this.request<YnabApiResponse<{ payees: YnabPayee[] }>>(
      path,
      options,
    );
    return response.data.payees;
  }

  /**
   * Get transactions for a plan, optionally filtered.
   */
  async getTransactions(
    budgetId: string,
    options?: TransactionFilterOptions,
  ): Promise<YnabTransactionSummary[]> {
    const path = buildTransactionsPath(budgetId, options);
    const response = await this.request<YnabApiResponse<{ transactions: YnabTransactionSummary[] }>>(
      path,
      options,
    );
    return response.data.transactions;
  }

  /**
   * Set or clear the flag on one plan transaction.
   *
   * YNAB exposes partial transaction updates through the collection PATCH
   * endpoint. Sending only the id and flag protects every unrelated field
   * from being overwritten.
   */
  async updateTransactionFlag(
    budgetId: string,
    transactionId: string,
    flagColor: YnabTransactionFlagColor,
    options?: { signal?: AbortSignal },
  ): Promise<YnabTransactionSummary | undefined> {
    assertTransactionFlagColor(flagColor);

    const response = await this.request<YnabApiResponse<YnabSaveTransactionsData>>(
      `/plans/${budgetId}/transactions`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          transactions: [{
            id: transactionId,
            flag_color: flagColor,
          }],
        }),
        signal: options?.signal,
      },
    );

    return response.data.transactions?.find((transaction) => transaction.id === transactionId)
      ?? response.data.transaction;
  }

  /**
   * Validate the access token by attempting to fetch budgets.
   * Returns true if valid, false if invalid/expired.
   * Throws for network errors and other non-auth failures.
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.getBudgets();
      return true;
    } catch (error) {
      if (isYnabApiError(error) && error.code === 'invalid_token') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Internal request method that applies client-level options.
   */
  private async request<T>(
    path: string,
    options?: ClientRequestOptions,
  ): Promise<T> {
    return requestJson<T>({
      path,
      accessToken: this.options.accessToken,
      baseUrl: this.options.baseUrl,
      fetchImpl: this.options.fetchImpl,
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      backoffMs: this.options.backoffMs,
      method: options?.method,
      headers: options?.headers,
      body: options?.body,
      signal: options?.signal,
    });
  }
}

const TRANSACTION_FLAG_COLORS = new Set<YnabTransactionFlagColor>([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  null,
]);

function assertTransactionFlagColor(
  flagColor: YnabTransactionFlagColor,
): asserts flagColor is YnabTransactionFlagColor {
  if (!TRANSACTION_FLAG_COLORS.has(flagColor)) {
    throw new TypeError('Unsupported YNAB transaction flag colour');
  }
}

function extractPlans(data: { plans?: YnabBudgetSummary[]; budgets?: YnabBudgetSummary[] }): YnabBudgetSummary[] {
  if (Array.isArray(data.plans)) {
    return data.plans;
  }

  if (Array.isArray(data.budgets)) {
    return data.budgets;
  }

  throw new Error('Unexpected YNAB plans response: missing plans array');
}

/**
 * Build a path with optional query parameters.
 */
function buildPath(basePath: string, options?: ListOptions): string {
  const params = new URLSearchParams();
  
  if (options?.lastKnowledgeOfServer !== undefined) {
    params.set('last_knowledge_of_server', String(options.lastKnowledgeOfServer));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Build the transactions endpoint path with filters.
 */
function buildTransactionsPath(budgetId: string, options?: TransactionFilterOptions): string {
  const params = new URLSearchParams();

  if (options?.sinceDate) {
    params.set('since_date', options.sinceDate);
  }

  if (options?.type) {
    params.set('type', options.type);
  }

  if (options?.lastKnowledgeOfServer !== undefined) {
    params.set('last_knowledge_of_server', String(options.lastKnowledgeOfServer));
  }

  const query = params.toString();
  const basePath = `/plans/${budgetId}/transactions`;
  return query ? `${basePath}?${query}` : basePath;
}
