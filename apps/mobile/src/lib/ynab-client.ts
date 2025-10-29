const YNAB_API_BASE_URL = 'https://api.ynab.com/v1';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 2;

export type YnabApiErrorCode =
  | 'invalid_token'
  | 'rate_limited'
  | 'network_error'
  | 'unknown_error';

export interface YnabApiError extends Error {
  code: YnabApiErrorCode;
  status?: number;
}

export interface YnabBudgetSummary {
  id: string;
  name: string;
  last_modified_on: string;
}

export interface YnabAccountSummary {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
}

export interface YnabTransactionSummary {
  id: string;
  date: string;
  amount: number;
  account_id: string;
  payee_name?: string | null;
  category_name?: string | null;
  memo?: string | null;
  cleared?: string | null;
  approved?: boolean;
  flag_color?: string | null;
  flag_name?: string | null;
}

interface YnabResponse<T> {
  data: T;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { timeoutMs?: number };

type TransactionFilter = {
  sinceDate?: string;
  type?: 'uncategorized' | 'unapproved';
  signal?: AbortSignal;
};

export class YnabClient {
  constructor(private readonly pat: string) {}

  async getBudgets(): Promise<YnabBudgetSummary[]> {
    const result = await this.request<YnabResponse<{ budgets: YnabBudgetSummary[] }>>('budgets');
    return result.data.budgets;
  }

  async getAccounts(budgetId: string): Promise<YnabAccountSummary[]> {
    const result = await this.request<YnabResponse<{ accounts: YnabAccountSummary[] }>>(
      `budgets/${budgetId}/accounts`,
    );
    return result.data.accounts.filter((account) => !account.closed);
  }

  async getTransactions(
    budgetId: string,
    options: TransactionFilter = {},
  ): Promise<YnabTransactionSummary[]> {
    const params = new URLSearchParams();
    if (options.sinceDate) {
      params.append('since_date', options.sinceDate);
    }
    if (options.type) {
      params.append('type', options.type);
    }

    const result = await this.request<YnabResponse<{ transactions: YnabTransactionSummary[] }>>(
      `budgets/${budgetId}/transactions${params.toString() ? `?${params}` : ''}`,
      { signal: options.signal },
    );
    return result.data.transactions;
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.getBudgets();
      return true;
    } catch (error) {
      if (error instanceof Error && (error as YnabApiError).code === 'invalid_token') {
        return false;
      }
      throw error;
    }
  }

  private async request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = options;
    const controller = new AbortController();
    const combinedSignal = mergeAbortSignals(signal ? [signal, controller.signal] : [controller.signal]);

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.requestWithRetry<T>(path, { ...init, signal: combinedSignal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestWithRetry<T>(path: string, init: RequestInit, attempt = 1): Promise<T> {
    try {
      const response = await fetch(`${YNAB_API_BASE_URL}/${path}`, {
        ...init,
        headers: {
          'Authorization': `Bearer ${this.pat}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw createYnabError('invalid_token', response.status, 'YNAB token invalid or expired');
      }

      if (response.status === 429) {
        if (attempt <= MAX_RETRY_ATTEMPTS) {
          const retryAfter = Number(response.headers.get('Retry-After'));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.requestWithRetry<T>(path, init, attempt + 1);
        }
        throw createYnabError('rate_limited', response.status, 'YNAB rate limit exceeded');
      }

      if (!response.ok) {
        const errorBody = await safeParseError(response);
        throw createYnabError('unknown_error', response.status, errorBody?.error || 'YNAB request failed');
      }

      return response.json() as Promise<T>;
    } catch (error) {
      const hasDomException = typeof DOMException !== 'undefined';
      if (hasDomException && error instanceof DOMException && error.name === 'AbortError') {
        throw createYnabError('network_error', undefined, 'YNAB request timed out');
      }

      if (isNetworkError(error)) {
        if (attempt <= MAX_RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
          return this.requestWithRetry<T>(path, init, attempt + 1);
        }
        throw createYnabError('network_error', undefined, 'Network request to YNAB failed');
      }

      throw error;
    }
  }
}

function createYnabError(code: YnabApiErrorCode, status?: number, message?: string): YnabApiError {
  const error = new Error(message || code) as YnabApiError;
  error.code = code;
  error.status = status;
  return error;
}

async function safeParseError(response: Response): Promise<{ error?: string } | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }
  if (error instanceof Error && /Network request failed/i.test(error.message)) {
    return true;
  }
  return false;
}

function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) {
    return signals[0];
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  signals.forEach((signal) => {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  return controller.signal;
}

export function isYnabApiError(error: unknown): error is YnabApiError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'code' in (error as Record<string, unknown>);
}
