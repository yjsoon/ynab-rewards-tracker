/* Thin YNAB client wrapper: adds rate budgeting and delta helpers.
 * NOTE: SDK not installed yet; this is just the interface and TODOs.
 */

export type Milli = number; // integer milliunits

export type Knowledge = {
  budgets?: number;
  accounts?: number;
  categories?: number;
  months?: number;
  payees?: number;
  transactions?: number;
};

export type RateBudget = {
  maxPerHour: number; // default 200 per YNAB token
};

export class YnabClient {
  constructor(private accessToken: string, private rate: RateBudget = { maxPerHour: 200 }) {}

  // TODO: implement with ynab SDK; placeholder signatures for compile-time wiring later.
  async getBudgets() { return { data: { budgets: [] } }; }
  async getAccounts(budgetId: string, last?: number) { void last; return { data: { accounts: [] }, server_knowledge: 0 }; }
  async getCategories(budgetId: string, last?: number) { void last; return { data: { category_groups: [] }, server_knowledge: 0 }; }
  async getPayees(budgetId: string, last?: number) { void last; return { data: { payees: [] }, server_knowledge: 0 }; }
  async getTransactions(budgetId: string, sinceDate?: string) { void sinceDate; return { data: { transactions: [] }, server_knowledge: 0 }; }
}

export function nextLeakyBucketDelay(requestsInLastHour: number, maxPerHour = 200): number {
  if (requestsInLastHour < maxPerHour) return 0;
  // naive: wait until 1 hour window would free 1 slot
  return 60_000; // 60s (placeholder)
}

