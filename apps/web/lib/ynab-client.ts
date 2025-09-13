/**
 * Client-side YNAB API wrapper
 * Uses local API proxy routes to avoid CORS issues
 */

import { storage } from './storage';

export class YnabClient {
  private pat: string;

  constructor(pat: string) {
    this.pat = pat;
  }

  private async request(path: string, options?: RequestInit) {
    const response = await fetch(`/api/ynab/${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.pat}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || 'YNAB API error');
    }

    return response.json();
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
