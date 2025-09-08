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
  private baseUrl = 'https://api.ynab.com/v1';
  private requestTimes: number[] = [];
  
  constructor(private accessToken: string, private rate: RateBudget = { maxPerHour: 200 }) {}

  private async rateLimitedFetch(url: string): Promise<Response> {
    // Simple rate limiting - track requests in the last hour
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(t => t > now - 3600000);
    
    if (this.requestTimes.length >= this.rate.maxPerHour) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = oldestRequest + 3600000 - now;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requestTimes.push(now);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (response.status === 429) {
      // Rate limited - wait and retry
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return this.rateLimitedFetch(url);
    }
    
    return response;
  }

  async getBudgets() {
    const response = await this.rateLimitedFetch(`${this.baseUrl}/budgets`);
    if (!response.ok) {
      throw new Error(`YNAB API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  
  async getAccounts(budgetId: string, last?: number) {
    const url = new URL(`${this.baseUrl}/budgets/${budgetId}/accounts`);
    if (last !== undefined) {
      url.searchParams.set('last_knowledge_of_server', last.toString());
    }
    const response = await this.rateLimitedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`YNAB API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  
  async getCategories(budgetId: string, last?: number) {
    const url = new URL(`${this.baseUrl}/budgets/${budgetId}/categories`);
    if (last !== undefined) {
      url.searchParams.set('last_knowledge_of_server', last.toString());
    }
    const response = await this.rateLimitedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`YNAB API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  
  async getPayees(budgetId: string, last?: number) {
    const url = new URL(`${this.baseUrl}/budgets/${budgetId}/payees`);
    if (last !== undefined) {
      url.searchParams.set('last_knowledge_of_server', last.toString());
    }
    const response = await this.rateLimitedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`YNAB API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  
  async getTransactions(budgetId: string, sinceDate?: string, last?: number) {
    const url = new URL(`${this.baseUrl}/budgets/${budgetId}/transactions`);
    if (sinceDate) {
      url.searchParams.set('since_date', sinceDate);
    }
    if (last !== undefined) {
      url.searchParams.set('last_knowledge_of_server', last.toString());
    }
    const response = await this.rateLimitedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`YNAB API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

export function nextLeakyBucketDelay(requestsInLastHour: number, maxPerHour = 200): number {
  if (requestsInLastHour < maxPerHour) return 0;
  // naive: wait until 1 hour window would free 1 slot
  return 60_000; // 60s (placeholder)
}

