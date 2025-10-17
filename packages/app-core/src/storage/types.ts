import type { YnabFlagColor } from '../ynab/constants';

/**
 * Unified transaction type used across web and core packages.
 * Combines fields from YNAB API responses with computed reward tracking.
 */
export interface Transaction {
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
  subtransactions?: Transaction[];
}

/**
 * Transaction extended with rewards calculation metadata.
 * Used by rewards engine and dashboard components.
 */
export interface TransactionWithRewards extends Transaction {
  // Legacy rewards object format (used by matcher)
  rewards?: {
    cardId: string;
    amount: number;
    rate: number;
  };
  // Modern computed fields (used by web components)
  eligibleAmount?: number;
  rewardEarned?: number;
}

/**
 * Minimal transaction shape for dashboard cache storage.
 * Reduces localStorage footprint by keeping only essential fields.
 */
export type CachedTransaction = Pick<
  Transaction,
  'id' | 'date' | 'amount' | 'account_id' | 'payee_name' |
  'category_name' | 'flag_color' | 'flag_name' | 'cleared' | 'approved'
>;

/**
 * Payload type for callers setting dashboard cache with full Transaction objects.
 * The service layer will sanitize these to CachedTransaction internally.
 */
export interface DashboardTransactionsCachePayload {
  budgetId: string;
  sinceDate: string;
  fetchedAt: string;
  trackedAccountIds: string[];
  transactions: Transaction[];
  accounts: Array<{ id: string; name: string }>;
}

export interface CardSubcategory {
  id: string;
  name: string;
  flagColor: YnabFlagColor;
  rewardValue: number;
  milesBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  priority: number;
  active: boolean;
  excludeFromRewards?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: 'cashback' | 'miles';
  ynabAccountId: string;
  billingCycle?: {
    type: 'calendar' | 'billing';
    dayOfMonth?: number;
  };
  featured: boolean;
  earningRate?: number;
  earningBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  subcategoriesEnabled?: boolean;
  subcategories?: CardSubcategory[];
}

// Legacy alias retained for compatibility with existing imports
export type Card = CreditCard;

export interface RewardRule {
  id: string;
  cardId: string;
  name: string;
  rewardType: 'cashback' | 'miles';
  rewardValue: number;
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

export type DashboardViewMode = 'summary' | 'detailed';

export type HiddenCardReason = 'maximum_spend_reached';

export interface HiddenCard {
  cardId: string;
  hiddenUntil: string;
  reason: HiddenCardReason;
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
  reward: number;
  rewardDollars?: number;
  capReached: boolean;
}

export interface SubcategoryBreakdown {
  subcategoryId: string;
  name: string;
  flagColor: YnabFlagColor;
  totalSpend: number;
  eligibleSpend: number;
  eligibleSpendBeforeBlocks?: number;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  minimumSpendMet: boolean;
  maximumSpendExceeded: boolean;
}

export interface RewardCalculation {
  cardId: string;
  ruleId: string;
  period: string;
  totalSpend: number;
  eligibleSpend: number;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  rewardType: 'cashback' | 'miles';
  categoryBreakdowns?: CategoryBreakdown[];
  subcategoryBreakdowns?: SubcategoryBreakdown[];
  minimumProgress?: number;
  maximumProgress?: number;
  minimumMet: boolean;
  maximumExceeded: boolean;
  shouldStopUsing: boolean;
}

export interface SubcategoryReference {
  cardId: string;
  subcategoryId: string;
}

export interface CardReference {
  cardId: string;
}

export interface ThemeGroup {
  id: string;
  name: string;
  description?: string;
  colour?: string;
  priority: number;
  subcategories: SubcategoryReference[];
  cards: CardReference[];
  createdAt: string;
  updatedAt: string;
}

export interface YnabConnection {
  pat?: string;
  lastSync?: string;
  selectedBudgetId?: string;
  selectedBudgetName?: string;
  trackedAccountIds?: string[];
}

export interface AppSettings {
  theme?: 'light' | 'dark' | 'auto';
  currency?: string;
  milesValuation?: number;
  dashboardViewMode?: DashboardViewMode;
  cloudSyncKeyId?: string;
  cloudSyncLastSyncedAt?: string;
  cardOrdering?: Partial<Record<'cashback' | 'miles', string[]>>;
  collapsedCardGroups?: Partial<Record<'cashback' | 'miles', boolean>>;
}

export interface DashboardTransactionsCacheEntry {
  budgetId: string;
  sinceDate: string;
  fetchedAt: string;
  trackedAccountIds: string[];
  transactions: CachedTransaction[];
  accounts: Array<{ id: string; name: string }>;
}

export interface StorageData {
  ynab: YnabConnection;
  cards: CreditCard[];
  rules: RewardRule[];
  tagMappings: TagMapping[];
  calculations: RewardCalculation[];
  themeGroups: ThemeGroup[];
  settings: AppSettings;
  hiddenCards?: HiddenCard[];
  cachedData?: {
    budgets?: unknown[];
    accounts?: unknown[];
    transactions?: unknown[];
    lastUpdated?: string;
    flagNames?: Partial<Record<YnabFlagColor, string>>;
    dashboardTransactions?: DashboardTransactionsCacheEntry[];
  };
}
