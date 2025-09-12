/**
 * Client-side storage utilities for YNAB Rewards Tracker
 * All user data is stored in browser localStorage
 */

export interface CreditCard {
  id: string;
  name: string;
  type: 'cashback' | 'miles';
  ynabAccountId: string;
  billingCycle: {
    type: 'calendar' | 'billing';
    dayOfMonth?: number; // for billing cycle
  };
  active: boolean;
}

export interface RewardRule {
  id: string;
  cardId: string;
  name: string;
  rewardType: 'cashback' | 'miles';
  rewardValue: number; // percentage or miles per dollar
  milesBlockSize?: number; // e.g., 5 for "$5 blocks"
  categories: string[]; // YNAB tag names
  minimumSpend?: number;
  maximumSpend?: number;
  categoryCaps?: CategoryCap[];
  startDate: string;
  endDate: string;
  active: boolean;
  priority: number;
}

export interface CategoryCap {
  category: string;
  maxSpend: number;
}

export interface TagMapping {
  id: string;
  cardId: string;
  ynabTag: string;
  rewardCategory: string;
}

export interface RewardCalculation {
  cardId: string;
  ruleId: string;
  period: string;
  totalSpend: number;
  eligibleSpend: number;
  rewardEarned: number;
  minimumProgress?: number;
  maximumProgress?: number;
  categoryBreakdowns: CategoryBreakdown[];
  minimumMet: boolean;
  maximumExceeded: boolean;
  shouldStopUsing: boolean;
}

export interface CategoryBreakdown {
  category: string;
  spend: number;
  reward: number;
  capReached: boolean;
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
  tagMappings: TagMapping[];
  calculations: RewardCalculation[];
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
        const data = JSON.parse(stored);
        // Migrate existing cards without billingCycle
        if (data.cards) {
          data.cards = data.cards.map((card: any) => {
            if (!card.billingCycle) {
              return {
                ...card,
                billingCycle: {
                  type: 'calendar' as const
                }
              };
            }
            return card;
          });
        }
        return data;
      }
    } catch (error) {
      // Log error in development, but gracefully fall back to defaults
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to parse localStorage:', error);
      }
    }
    
    return this.getDefaultStorage();
  }

  private getDefaultStorage(): StorageData {
    return {
      ynab: {},
      cards: [],
      rules: [],
      tagMappings: [],
      calculations: [],
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
    } catch (error) {
      // Log error in development, but continue gracefully
      // Storage may be full, disabled, or in private browsing mode
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to set localStorage:', error);
      }
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

  // Tag mappings management
  getTagMappings(): TagMapping[] {
    return this.getStorage().tagMappings || [];
  }

  getCardTagMappings(cardId: string): TagMapping[] {
    return this.getTagMappings().filter(m => m.cardId === cardId);
  }

  saveTagMapping(mapping: TagMapping): void {
    const storage = this.getStorage();
    const index = storage.tagMappings.findIndex(m => m.id === mapping.id);
    if (index >= 0) {
      storage.tagMappings[index] = mapping;
    } else {
      storage.tagMappings.push(mapping);
    }
    this.setStorage(storage);
  }

  deleteTagMapping(mappingId: string): void {
    const storage = this.getStorage();
    storage.tagMappings = storage.tagMappings.filter(m => m.id !== mappingId);
    this.setStorage(storage);
  }

  // Calculations management
  getCalculations(): RewardCalculation[] {
    return this.getStorage().calculations || [];
  }

  getCardCalculations(cardId: string): RewardCalculation[] {
    return this.getCalculations().filter(c => c.cardId === cardId);
  }

  saveCalculation(calculation: RewardCalculation): void {
    const storage = this.getStorage();
    const index = storage.calculations.findIndex(c => 
      c.cardId === calculation.cardId && 
      c.ruleId === calculation.ruleId && 
      c.period === calculation.period
    );
    if (index >= 0) {
      storage.calculations[index] = calculation;
    } else {
      storage.calculations.push(calculation);
    }
    this.setStorage(storage);
  }

  deleteCalculation(cardId: string, ruleId: string, period: string): void {
    const storage = this.getStorage();
    storage.calculations = storage.calculations.filter(c => 
      !(c.cardId === cardId && c.ruleId === ruleId && c.period === period)
    );
    this.setStorage(storage);
  }

  clearCalculations(): void {
    const storage = this.getStorage();
    storage.calculations = [];
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