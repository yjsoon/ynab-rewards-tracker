/**
 * Client-side storage utilities for YNAB Rewards Tracker
 * All user data is stored in browser localStorage
 */

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: 'cashback' | 'points' | 'miles';
  color?: string;
  active: boolean;
  ynabAccountId?: string; // Link to YNAB account if connected
  isManual?: boolean; // True if manually added, false if from YNAB
}

export interface RewardRule {
  id: string;
  cardId: string;
  name: string;
  category: string; // YNAB category or 'all'
  rewardType: 'percent' | 'points' | 'miles';
  rewardValue: number; // e.g., 2 for 2% or 2x points
  capAmount?: number; // spending cap in dollars
  capPeriod?: 'monthly' | 'quarterly' | 'annually';
  priority: number;
  active: boolean;
}

export interface YnabConnection {
  pat?: string;
  lastSync?: string;
  selectedBudgetId?: string;
  selectedBudgetName?: string;
  trackedAccountIds?: string[]; // YNAB account IDs marked for tracking
}

export interface AppSettings {
  theme?: 'light' | 'dark' | 'auto';
  currency?: string;
}

export interface StorageData {
  ynab: YnabConnection;
  cards: CreditCard[];
  rules: RewardRule[];
  settings: AppSettings;
  cachedData?: {
    budgets?: any[];
    accounts?: any[];
    transactions?: any[];
    lastUpdated?: string;
  };
}

const STORAGE_KEY = 'ynab-rewards-tracker';

class StorageService {
  private getStorage(): StorageData {
    if (typeof window === 'undefined') {
      return this.getDefaultStorage();
    }
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Silent failure - return default storage
    }
    
    return this.getDefaultStorage();
  }

  private getDefaultStorage(): StorageData {
    return {
      ynab: {},
      cards: [],
      rules: [],
      settings: {
        theme: 'light',
        currency: 'USD',
      },
    };
  }

  private setStorage(data: StorageData): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Silent failure - storage may be full or disabled
    }
  }

  // PAT management
  getPAT(): string | undefined {
    return this.getStorage().ynab.pat;
  }

  setPAT(pat: string): void {
    const storage = this.getStorage();
    storage.ynab.pat = pat;
    this.setStorage(storage);
  }

  clearPAT(): void {
    const storage = this.getStorage();
    delete storage.ynab.pat;
    this.setStorage(storage);
  }

  // Budget management
  getSelectedBudget(): { id?: string; name?: string } {
    const { selectedBudgetId, selectedBudgetName } = this.getStorage().ynab;
    return { id: selectedBudgetId, name: selectedBudgetName };
  }

  setSelectedBudget(budgetId: string, budgetName: string): void {
    const storage = this.getStorage();
    storage.ynab.selectedBudgetId = budgetId;
    storage.ynab.selectedBudgetName = budgetName;
    this.setStorage(storage);
  }

  // Tracked accounts management
  getTrackedAccountIds(): string[] {
    return this.getStorage().ynab.trackedAccountIds || [];
  }

  setTrackedAccountIds(accountIds: string[]): void {
    const storage = this.getStorage();
    storage.ynab.trackedAccountIds = accountIds;
    this.setStorage(storage);
  }

  isAccountTracked(accountId: string): boolean {
    const trackedIds = this.getTrackedAccountIds();
    return trackedIds.includes(accountId);
  }

  // Cards management
  getCards(): CreditCard[] {
    return this.getStorage().cards || [];
  }

  saveCard(card: CreditCard): void {
    const storage = this.getStorage();
    const index = storage.cards.findIndex(c => c.id === card.id);
    if (index >= 0) {
      storage.cards[index] = card;
    } else {
      storage.cards.push(card);
    }
    this.setStorage(storage);
  }

  deleteCard(cardId: string): void {
    const storage = this.getStorage();
    storage.cards = storage.cards.filter(c => c.id !== cardId);
    // Also delete associated rules
    storage.rules = storage.rules.filter(r => r.cardId !== cardId);
    this.setStorage(storage);
  }

  // Rules management
  getRules(): RewardRule[] {
    return this.getStorage().rules || [];
  }

  getCardRules(cardId: string): RewardRule[] {
    return this.getRules().filter(r => r.cardId === cardId);
  }

  saveRule(rule: RewardRule): void {
    const storage = this.getStorage();
    const index = storage.rules.findIndex(r => r.id === rule.id);
    if (index >= 0) {
      storage.rules[index] = rule;
    } else {
      storage.rules.push(rule);
    }
    this.setStorage(storage);
  }

  deleteRule(ruleId: string): void {
    const storage = this.getStorage();
    storage.rules = storage.rules.filter(r => r.id !== ruleId);
    this.setStorage(storage);
  }

  // Cache management
  getCachedData(): StorageData['cachedData'] {
    return this.getStorage().cachedData;
  }

  setCachedData(data: StorageData['cachedData']): void {
    const storage = this.getStorage();
    storage.cachedData = data;
    this.setStorage(storage);
  }

  // Export/Import
  exportSettings(): string {
    const storage = this.getStorage();
    // Exclude PAT from export for security
    const exportData = {
      ...storage,
      ynab: { ...storage.ynab, pat: undefined },
    };
    return JSON.stringify(exportData, null, 2);
  }

  importSettings(jsonString: string): void {
    try {
      const imported = JSON.parse(jsonString);
      const storage = this.getStorage();
      
      // Merge imported data, preserving PAT
      const pat = storage.ynab.pat;
      Object.assign(storage, imported);
      if (pat) {
        storage.ynab.pat = pat;
      }
      
      this.setStorage(storage);
    } catch (error) {
      throw new Error('Invalid settings file');
    }
  }

  // Clear all data
  clearAll(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const storage = new StorageService();