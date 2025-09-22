/**
 * Client-side storage utilities for YJAB – YJ's Awards Buddy
 * All user data is stored in browser localStorage
 */

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: 'cashback' | 'miles';
  ynabAccountId: string; // YNAB account ID (required; no manual cards)
  billingCycle?: {
    type: 'calendar' | 'billing';
    dayOfMonth?: number; // for billing cycle
  };
  featured: boolean; // Controls dashboard visibility; tracking is handled in settings
  // Earning rates (replaces the complex rules system)
  earningRate?: number; // For cashback: percentage (e.g., 2 for 2%). For miles: miles per dollar (e.g., 1.5)
  // Earning block size for block-based earning (e.g., 1 mile per $5 spent)
  earningBlockSize?: number | null; // null = down to the cent, number = dollar block size for earning calculation
  // Minimum spend requirement (three states: null = not configured, 0 = no minimum, >0 = has minimum)
  minimumSpend?: number | null; // Dollar amount required to earn rewards for this period
  // Maximum spend limit (three states: null = not configured, 0 = no limit, >0 = has limit)
  maximumSpend?: number | null; // Dollar amount cap for earning rewards this period
}

export interface RewardRule {
  id: string;
  cardId: string;
  name: string;
  rewardType: 'cashback' | 'miles';
  rewardValue: number; // percentage or miles per dollar
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
  capAmount: number;
}

export interface TagMapping {
  id: string;
  cardId: string;
  ynabTag: string;
  rewardCategory: string;
}

export interface CategoryBreakdown {
  category: string;
  spend: number;
  reward: number; // Raw reward units
  rewardDollars?: number; // Normalized dollar value
  capReached: boolean;
}

export interface RewardCalculation {
  cardId: string;
  ruleId: string;
  period: string;
  totalSpend: number;
  eligibleSpend: number;
  rewardEarned: number; // Raw reward units (dollars for cashback, miles for others)
  rewardEarnedDollars?: number; // Normalized dollar value for comparison
  rewardType: 'cashback' | 'miles'; // Track the type for clarity
  categoryBreakdowns?: CategoryBreakdown[];
  minimumProgress?: number;
  maximumProgress?: number;
  minimumMet: boolean;
  maximumExceeded: boolean;
  shouldStopUsing: boolean;
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
  milesValuation?: number; // Dollar value per mile (default: 0.01)
}

export interface StorageData {
  ynab: YnabConnection;
  cards: CreditCard[];
  rules: RewardRule[];
  tagMappings: TagMapping[];
  calculations: RewardCalculation[];
  settings: AppSettings;
  cachedData?: {
    budgets?: unknown[];
    accounts?: unknown[];
    transactions?: unknown[];
    lastUpdated?: string; // also used as last computed timestamp for rewards
  };
}

const STORAGE_KEY = 'ynab-rewards-tracker';
const UI_SEEN_SETUP_KEY = 'ynab-rewards-tracker:hasSeenSetupPrompt';

type MutableCard = CreditCard & Record<string, unknown> & { active?: boolean };
type MutableRule = RewardRule & Record<string, unknown>;
type MutableCalculation = RewardCalculation & Record<string, unknown>;
type MutableCategoryBreakdown = CategoryBreakdown & Record<string, unknown>;
type MutableSettings = AppSettings & Record<string, unknown>;

class StorageService {
  private getStorage(): StorageData {
    if (typeof window === 'undefined') {
      return this.getDefaultStorage();
    }
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as StorageData;
        // Migrate existing cards without billingCycle
        if (Array.isArray(data.cards)) {
          data.cards = data.cards.map((card) => {
            const nextCard: MutableCard = { ...card } as MutableCard;
            if (!nextCard.billingCycle) {
              nextCard.billingCycle = {
                type: 'calendar' as const // dayOfMonth only applies to 'billing'
              };
            }
            if (typeof nextCard.featured !== 'boolean') {
              nextCard.featured = typeof nextCard.active === 'boolean' ? Boolean(nextCard.active) : true;
            }
            // Remove 'active' property cleanly using destructuring
            if ('active' in nextCard) {
              const { active, ...cleanCard } = nextCard;
              return cleanCard as CreditCard;
            }
            return nextCard as CreditCard;
          });
        }
        // Migrations: field renames and defaults
        try {
          // Ensure issuer defaults to a string
          if (Array.isArray(data.cards)) {
            data.cards = data.cards.map((card) => {
              const mutableCard: MutableCard = { ...card } as MutableCard;
              if (typeof mutableCard.issuer !== 'string') {
                mutableCard.issuer = 'Unknown';
              }
              return mutableCard as CreditCard;
            });
          }

          if (Array.isArray(data.calculations)) {
            data.calculations = data.calculations.map((calc) => {
              const mutableCalc: MutableCalculation = { ...calc } as MutableCalculation;

              if ('rewardEarnedUSD' in mutableCalc && mutableCalc.rewardEarnedDollars == null) {
                mutableCalc.rewardEarnedDollars = Number(mutableCalc.rewardEarnedUSD);
                Reflect.deleteProperty(mutableCalc, 'rewardEarnedUSD');
              }
              // Migration: collapse 'points' into 'miles'
              const calcType = (mutableCalc.rewardType as string | undefined);
              if (calcType === 'points') {
                mutableCalc.rewardType = 'miles';
              }
              if (Array.isArray(mutableCalc.categoryBreakdowns)) {
                mutableCalc.categoryBreakdowns = mutableCalc.categoryBreakdowns.map((cb) => {
                  const mutableBreakdown: MutableCategoryBreakdown = { ...cb } as MutableCategoryBreakdown;
                  if ('rewardUSD' in mutableBreakdown && mutableBreakdown.rewardDollars == null) {
                    mutableBreakdown.rewardDollars = Number(mutableBreakdown.rewardUSD);
                    Reflect.deleteProperty(mutableBreakdown, 'rewardUSD');
                  }
                  return mutableBreakdown as CategoryBreakdown;
                });
              }

              return mutableCalc as RewardCalculation;
            });
          }

          // Migration: convert any 'points' card/rule types to 'miles'
          if (Array.isArray(data.cards)) {
            data.cards = data.cards.map((card) => {
              const mutableCard: MutableCard = { ...card } as MutableCard;
              const cardType = mutableCard.type as string | undefined;
              if (cardType === 'points') {
                mutableCard.type = 'miles';
              }
              if ('milesBlockSize' in mutableCard) {
                const { milesBlockSize, ...cleanCard } = mutableCard;
                return cleanCard as CreditCard;
              }
              return mutableCard as CreditCard;
            });
          }
          if (Array.isArray(data.rules)) {
            data.rules = data.rules.map((rule) => {
              const mutableRule: MutableRule = { ...rule } as MutableRule;
              const rewardType = mutableRule.rewardType as string | undefined;
              if (rewardType === 'points') {
                mutableRule.rewardType = 'miles';
              }
              if ('milesBlockSize' in mutableRule) {
                const { milesBlockSize, ...cleanRule } = mutableRule;
                return cleanRule as RewardRule;
              }
              return mutableRule as RewardRule;
            });
          }

          // Migration: if pointsValuation exists and milesValuation is undefined, copy it over; then drop pointsValuation
          if (data.settings) {
            const settings = data.settings as MutableSettings;
            const mv = settings.milesValuation;
            const pv = settings.pointsValuation;
            if ((mv == null || typeof mv !== 'number') && typeof pv === 'number') {
              settings.milesValuation = pv;
            }
            if ('pointsValuation' in settings) {
              Reflect.deleteProperty(settings, 'pointsValuation');
            }
          }

          // Migration: Add default earning rates to cards that don't have them
          if (Array.isArray(data.cards)) {
            data.cards = data.cards.map((card) => {
              const mutableCard: MutableCard = { ...card } as MutableCard;
              if (!mutableCard.earningRate) {
                // Try to derive from existing rules if any
                const cardRules = Array.isArray(data.rules)
                  ? data.rules.filter((rule) => rule.cardId === mutableCard.id && rule.active)
                  : [];
                if (cardRules.length > 0) {
                  // Use the first active rule's reward value as the earning rate
                  const firstRule = cardRules[0];
                  mutableCard.earningRate = firstRule.rewardValue || 1;
                } else {
                  // Default earning rates
                  mutableCard.earningRate = 1;
                }
              }
              return mutableCard as CreditCard;
            });
          }

          // Migration: Add minimumSpend field to cards that don't have it (default to null = not configured)
          if (Array.isArray(data.cards)) {
            data.cards = data.cards.map((card) => {
              const mutableCard: MutableCard = { ...card } as MutableCard;
              if (!('minimumSpend' in mutableCard)) {
                // Default to null (not configured) - users need to explicitly set this
                mutableCard.minimumSpend = null;
              }
              return mutableCard as CreditCard;
            });
          }

          // Migration: Add maximumSpend field to cards that don't have it (default to null = not configured)
          if (Array.isArray(data.cards)) {
            data.cards = data.cards.map((card) => {
              const mutableCard: MutableCard = { ...card } as MutableCard;
              if (!('maximumSpend' in mutableCard)) {
                // Default to null (not configured) - users need to explicitly set this
                mutableCard.maximumSpend = null;
              }
              return mutableCard as CreditCard;
            });
          }

          // Migration: Add earningBlockSize field to cards that don't have it (default to null = exact earning)
          if (Array.isArray(data.cards)) {
            data.cards = data.cards.map((card) => {
              const mutableCard: MutableCard = { ...card } as MutableCard;
              if (!('earningBlockSize' in mutableCard)) {
                // Default to null (exact earning) - users need to explicitly set this
                mutableCard.earningBlockSize = null;
              }
              return mutableCard as CreditCard;
            });
          }

          // Migration: Initialize tagMappings if missing
          if (!data.tagMappings) {
            data.tagMappings = [];
          }

          // Note: billingCycle defaulting handled earlier when reading cards
        } catch (migrationError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Storage migration failed', migrationError);
          }
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

  // Lightweight UI flags (kept outside main blob)
  getHasSeenSetupPrompt(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(UI_SEEN_SETUP_KEY) === 'true';
    } catch {
      return false;
    }
  }

  setHasSeenSetupPrompt(seen: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      if (seen) {
        localStorage.setItem(UI_SEEN_SETUP_KEY, 'true');
      } else {
        localStorage.removeItem(UI_SEEN_SETUP_KEY);
      }
    } catch {
      // ignore – non-critical UI hint
    }
  }

  // Settings
  getSettings(): AppSettings {
    return this.getStorage().settings || {};
  }

  updateSettings(settings: Partial<AppSettings>): void {
    const storage = this.getStorage();
    storage.settings = {
      ...storage.settings,
      ...settings,
    };
    this.setStorage(storage);
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
    // Also delete associated tag mappings
    storage.tagMappings = storage.tagMappings.filter(m => m.cardId !== cardId);
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

  // Delete all calculations for a specific period (e.g., '2025-09' or '2025-09-02')
  deleteCalculationsForPeriod(period: string): void {
    const storage = this.getStorage();
    storage.calculations = (storage.calculations || []).filter(c => c.period !== period);
    this.setStorage(storage);
  }

  // Last computed timestamp helpers
  getLastComputedAt(): string | undefined {
    return this.getStorage().cachedData?.lastUpdated;
  }

  setLastComputedAt(isoString: string): void {
    const storage = this.getStorage();
    storage.cachedData = storage.cachedData || {};
    storage.cachedData.lastUpdated = isoString;
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
