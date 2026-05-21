/**
 * Client-side YNAB API wrapper
 * Uses local API proxy routes to avoid CORS issues.
 *
 * Note: This wrapper adds caching and request deduplication on top of the
 * shared YNAB client types. It uses a proxy URL for CORS, so doesn't use
 * the core YnabClient directly.
 */

import type { Transaction } from "@/types/transaction";
import type { BudgetAccountsCacheAccount } from "./storage";
import { storage } from "./storage";
import {
  UNFLAGGED_FLAG,
  YNAB_FLAG_COLORS,
  type YnabFlagColor,
} from "./ynab-constants";

// Re-export shared types for backwards compatibility
export type {
  YnabBudgetSummary,
  YnabAccountSummary,
  YnabPayee,
  YnabTransactionSummary,
  YnabCategoryGroup,
  YnabCategory,
  YnabApiResponse,
} from "@ynab-counter/ynab-client";

// Re-export error types for consumers
export {
  YnabApiError,
  isYnabApiError,
  createYnabError,
} from "@ynab-counter/ynab-client";
export type { YnabApiErrorCode } from "@ynab-counter/ynab-client";

import type {
  YnabBudgetSummary,
  YnabAccountSummary,
  YnabPayee,
} from "@ynab-counter/ynab-client";

// Simple in-memory de-dupe and cache for GETs within a short window.
// Avoids hammering YNAB when multiple components request the same path.
const inflightGet = new Map<string, Promise<unknown>>();
const getCache = new Map<string, { expiry: number; data: unknown }>();
const CACHE_TTL_MS = 30_000; // 30s soft cache; YNAB data isn't ultra-realtime
const MAX_GET_CACHE_ENTRIES = 100;
const ACCOUNTS_CACHE_TTL_MS = 5 * 60 * 1000;
const FLAG_NAMES_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_FLAG_NAMES_CACHE_ENTRIES = 50;
let nextClientCacheScope = 0;
const inflightFlagNames = new Map<
  string,
  Promise<Partial<Record<YnabFlagColor, string>>>
>();
const flagNamesCache = new Map<
  string,
  { expiry: number; data: Partial<Record<YnabFlagColor, string>> }
>();

function pruneExpiredGetCache(now = Date.now()) {
  for (const [key, cached] of getCache) {
    if (cached.expiry <= now) {
      getCache.delete(key);
    }
  }

  while (getCache.size > MAX_GET_CACHE_ENTRIES) {
    const oldestKey = getCache.keys().next().value;
    if (!oldestKey) break;
    getCache.delete(oldestKey);
  }
}

function pruneExpiredFlagNamesCache(now = Date.now()) {
  for (const [key, cached] of flagNamesCache) {
    if (cached.expiry <= now) {
      flagNamesCache.delete(key);
    }
  }

  while (flagNamesCache.size > MAX_FLAG_NAMES_CACHE_ENTRIES) {
    const oldestKey = flagNamesCache.keys().next().value;
    if (!oldestKey) break;
    flagNamesCache.delete(oldestKey);
  }
}

function makeKey(path: string, cacheScope: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  // Only cache GETs without AbortSignals
  // Include a per-client scope to prevent cross-token cache reuse without
  // retaining raw bearer tokens in module memory.
  return `${method}:${cacheScope}:${path}`;
}

function makeFlagNamesKey(budgetId: string, cacheScope: string) {
  return `FLAG_NAMES:${cacheScope}:${budgetId}`;
}

interface YnabResponse<T> {
  data: T;
}

interface YnabRequestOptions extends RequestInit {
  bypassCache?: boolean;
}

export class YnabClient {
  private pat: string;
  private cacheScope: string;

  constructor(pat: string) {
    this.pat = pat;
    this.cacheScope = `client-${++nextClientCacheScope}`;
  }

  private async request<T>(
    path: string,
    options?: YnabRequestOptions,
  ): Promise<T> {
    const method = (options?.method || "GET").toUpperCase();
    const hasSignal = !!options?.signal;
    const bypassCache = options?.bypassCache === true;
    const key = makeKey(path, this.cacheScope, options);

    // Serve from short cache for GETs without signals
    if (method === "GET" && !hasSignal && !bypassCache) {
      const now = Date.now();
      pruneExpiredGetCache(now);
      const cached = getCache.get(key);
      if (cached && cached.expiry > now) {
        return cached.data as T;
      }

      const existing = inflightGet.get(key);
      if (existing) return existing as Promise<T>;
    }

    const doFetch = async (attempt = 1): Promise<T> => {
      const { bypassCache: _bypassCache, ...fetchOptions } = options ?? {};
      const response = await fetch(`/api/ynab/${path}`, {
        ...fetchOptions,
        headers: {
          Authorization: `Bearer ${this.pat}`,
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        },
      });

      if (!response.ok) {
        // Gentle backoff on 429 once
        if (response.status === 429 && attempt === 1 && method === "GET") {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const delayMs =
            isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
          await new Promise((r) => setTimeout(r, delayMs));
          return doFetch(2);
        }

        let message: string | null = null;
        try {
          const error = await response.json();
          message = error?.message || error?.error || JSON.stringify(error);
        } catch {
          const text = await response.text().catch(() => "");
          message = text || null;
        }
        throw new Error(message || "YNAB API error");
      }

      return response.json() as Promise<T>;
    };

    const promise = doFetch();

    if (method === "GET" && !hasSignal && !bypassCache) {
      inflightGet.set(key, promise as Promise<unknown>);
    }

    try {
      const data = await promise;
      if (method === "GET" && !hasSignal && !bypassCache) {
        pruneExpiredGetCache();
        getCache.set(key, { expiry: Date.now() + CACHE_TTL_MS, data });
        pruneExpiredGetCache();
      }
      return data;
    } finally {
      if (method === "GET" && !hasSignal && !bypassCache) {
        inflightGet.delete(key);
      }
    }
  }

  // Budgets
  async getBudgets(init?: YnabRequestOptions) {
    const result = await this.request<
      YnabResponse<{ budgets: YnabBudgetSummary[] }>
    >("budgets", init);
    return result.data.budgets;
  }

  async getBudget(budgetId: string, init?: YnabRequestOptions) {
    const result = await this.request<YnabResponse<{ budget: unknown }>>(
      `budgets/${budgetId}`,
      init,
    );
    return result.data.budget;
  }

  // Accounts
  async getAccounts<TAccount = YnabAccountSummary>(
    budgetId: string,
    init?: YnabRequestOptions,
  ) {
    const bypassCache = init?.bypassCache === true;
    const cachedAccounts = bypassCache
      ? null
      : storage.getBudgetAccountsCache<TAccount & BudgetAccountsCacheAccount>(
          budgetId,
          ACCOUNTS_CACHE_TTL_MS,
          this.pat,
        );

    if (cachedAccounts) {
      return cachedAccounts;
    }

    const result = await this.request<YnabResponse<{ accounts: TAccount[] }>>(
      `budgets/${budgetId}/accounts`,
      init,
    );
    storage.setBudgetAccountsCache(
      budgetId,
      result.data.accounts as Array<TAccount & BudgetAccountsCacheAccount>,
      new Date().toISOString(),
      this.pat,
    );
    return result.data.accounts;
  }

  async getBudgetSettings(budgetId: string, init?: YnabRequestOptions) {
    const result = await this.request<
      YnabResponse<{ settings: Record<string, unknown> }>
    >(`budgets/${budgetId}/settings`, init);
    return result.data.settings;
  }

  async getCustomFlagNames(
    budgetId: string,
  ): Promise<Partial<Record<YnabFlagColor, string>>> {
    const cacheKey = makeFlagNamesKey(budgetId, this.cacheScope);
    pruneExpiredFlagNamesCache();
    const cached = flagNamesCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const inflight = inflightFlagNames.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      try {
        const settings = await this.getBudgetSettings(budgetId);
        if (!settings) {
          return {};
        }

        const display = settings?.display ?? settings;
        const candidates: Partial<Record<YnabFlagColor, string>> = {};
        const flagValues: YnabFlagColor[] = [
          UNFLAGGED_FLAG.value,
          ...YNAB_FLAG_COLORS.map((flag) => flag.value),
        ];

        const assignIfMatch = (key: string, value: unknown) => {
          if (typeof value !== "string") return;
          for (const colour of flagValues) {
            // Use word boundary check to avoid false positives (e.g., 'colored_red' matching 'red')
            const colourRegex = new RegExp(`\\b${colour}\\b`, "i");
            if (colourRegex.test(key)) {
              candidates[colour] = value;
            }
          }
        };

        if (display && typeof display === "object") {
          Object.entries(display).forEach(([key, value]) =>
            assignIfMatch(key, value),
          );

          const flagNamesAlias =
            (display as Record<string, unknown>).flag_names ??
            (display as Record<string, unknown>).flagNames;
          if (flagNamesAlias && typeof flagNamesAlias === "object") {
            Object.entries(flagNamesAlias as Record<string, unknown>).forEach(
              ([key, value]) => assignIfMatch(key, value),
            );
          }
        }

        if (!candidates[UNFLAGGED_FLAG.value]) {
          candidates[UNFLAGGED_FLAG.value] = UNFLAGGED_FLAG.label;
        }

        flagNamesCache.set(cacheKey, {
          expiry: Date.now() + FLAG_NAMES_CACHE_TTL_MS,
          data: candidates,
        });
        pruneExpiredFlagNamesCache();

        return candidates;
      } catch (error) {
        console.warn("Failed to fetch YNAB flag names", error);
        return {};
      }
    })();

    inflightFlagNames.set(cacheKey, request);

    try {
      return await request;
    } finally {
      if (inflightFlagNames.get(cacheKey) === request) {
        inflightFlagNames.delete(cacheKey);
      }
    }
  }

  // Categories
  async getCategories(budgetId: string, init?: YnabRequestOptions) {
    const result = await this.request<
      YnabResponse<{ category_groups: unknown }>
    >(`budgets/${budgetId}/categories`, init);
    return result.data.category_groups;
  }

  // Transactions
  async getTransactions(
    budgetId: string,
    options?: {
      since_date?: string;
      type?: "uncategorized" | "unapproved";
      signal?: AbortSignal;
      bypassCache?: boolean;
    },
  ) {
    const params = new URLSearchParams();
    if (options?.since_date) params.append("since_date", options.since_date);
    if (options?.type) params.append("type", options.type);

    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await this.request<
      YnabResponse<{ transactions: Transaction[] }>
    >(`budgets/${budgetId}/transactions${query}`, {
      signal: options?.signal,
      bypassCache: options?.bypassCache,
    });
    return result.data.transactions;
  }

  async getTransaction(
    budgetId: string,
    transactionId: string,
    init?: YnabRequestOptions,
  ) {
    const result = await this.request<
      YnabResponse<{ transaction: Transaction }>
    >(`budgets/${budgetId}/transactions/${transactionId}`, init);
    return result.data.transaction;
  }

  // Payees
  async getPayees(budgetId: string, init?: YnabRequestOptions) {
    const result = await this.request<YnabResponse<{ payees: YnabPayee[] }>>(
      `budgets/${budgetId}/payees`,
      init,
    );
    return result.data.payees;
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.getBudgets();
      return true;
    } catch {
      return false;
    }
  }
}

// Helper to get client with current PAT from storage
export function getYnabClient(pat?: string): YnabClient | null {
  // Use provided PAT or read from storage service for consistency
  const token =
    pat || (typeof window !== "undefined" ? storage.getPAT() : null) || null;
  if (!token) return null;
  return new YnabClient(token);
}
