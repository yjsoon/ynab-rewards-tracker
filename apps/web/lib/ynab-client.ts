/**
 * Client-side YNAB API wrapper
 * Uses local API proxy routes to avoid CORS issues
 */

import { storage } from './storage';

// Simple in-memory de-dupe and cache for GETs within a short window.
// Avoids hammering YNAB when multiple components request the same path.
const inflightGet = new Map<string, Promise<any>>();
const getCache = new Map<string, { expiry: number; data: any }>();
const CACHE_TTL_MS = 30_000; // 30s soft cache; YNAB data isn't ultra-realtime

function makeKey(path: string, pat: string, init?: RequestInit) {
  const method = (init?.method || 'GET').toUpperCase();
  // Only cache GETs without AbortSignals
  // Include PAT in key to prevent cross-token cache reuse
  return `${method}:${pat}:${path}`;
}

export class YnabClient {
  private pat: string;

  constructor(pat: string) {
    this.pat = pat;
  }

  private async request(path: string, options?: RequestInit) {
    const method = (options?.method || 'GET').toUpperCase();
    const hasSignal = !!options?.signal;
    const key = makeKey(path, this.pat, options);

    // Serve from short cache for GETs without signals
    if (method === 'GET' && !hasSignal) {
      const cached = getCache.get(key);
      const now = Date.now();
      if (cached && cached.expiry > now) {
        return cached.data;
      }

      const existing = inflightGet.get(key);
      if (existing) return existing;
    }

    const doFetch = async (attempt = 1): Promise<any> => {
      const response = await fetch(`/api/ynab/${path}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.pat}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        // Gentle backoff on 429 once
        if (response.status === 429 && attempt === 1 && method === 'GET') {
          const retryAfter = Number(response.headers.get('Retry-After'));
          const delayMs = isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
          await new Promise(r => setTimeout(r, delayMs));
          return doFetch(2);
        }

        try {
          const error = await response.json();
          const message = error?.message || error?.error || JSON.stringify(error);
          throw new Error(message || 'YNAB API error');
        } catch {
          const text = await response.text().catch(() => '');
          throw new Error(text || 'YNAB API error');
        }
      }

      return response.json();
    };

    const promise = doFetch();

    if (method === 'GET' && !hasSignal) {
      inflightGet.set(key, promise);
    }

    try {
      const data = await promise;
      if (method === 'GET' && !hasSignal) {
        getCache.set(key, { expiry: Date.now() + CACHE_TTL_MS, data });
      }
      return data;
    } finally {
      if (method === 'GET' && !hasSignal) {
        inflightGet.delete(key);
      }
    }
  }

  // Budgets
  async getBudgets(init?: RequestInit) {
    const result = await this.request('budgets', init);
    return result.data.budgets;
  }

  async getBudget(budgetId: string, init?: RequestInit) {
    const result = await this.request(`budgets/${budgetId}`, init);
    return result.data.budget;
  }

  // Accounts
  async getAccounts(budgetId: string, init?: RequestInit) {
    const result = await this.request(`budgets/${budgetId}/accounts`, init);
    return result.data.accounts;
  }

  // Categories
  async getCategories(budgetId: string, init?: RequestInit) {
    const result = await this.request(`budgets/${budgetId}/categories`, init);
    return result.data.category_groups;
  }

  // Transactions
  async getTransactions(
    budgetId: string, 
    options?: { 
      since_date?: string;
      type?: 'uncategorized' | 'unapproved';
      signal?: AbortSignal;
    }
  ) {
    const params = new URLSearchParams();
    if (options?.since_date) params.append('since_date', options.since_date);
    if (options?.type) params.append('type', options.type);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request(`budgets/${budgetId}/transactions${query}`, {
      signal: options?.signal
    });
    return result.data.transactions;
  }

  async getTransaction(budgetId: string, transactionId: string, init?: RequestInit) {
    const result = await this.request(`budgets/${budgetId}/transactions/${transactionId}`, init);
    return result.data.transaction;
  }

  // Payees
  async getPayees(budgetId: string, init?: RequestInit) {
    const result = await this.request(`budgets/${budgetId}/payees`, init);
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
  const token = pat || (typeof window !== 'undefined' ? storage.getPAT() : null) || null;
  if (!token) return null;
  return new YnabClient(token);
}
