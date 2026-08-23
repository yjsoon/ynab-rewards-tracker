import type { YnabFlagColor } from "../ynab/constants";

/**
 * Unified transaction type used across web and core packages.
 * Combines fields from YNAB API responses with computed reward tracking.
 */
export interface Transaction {
  id: string;
  date: string;
  amount: number;
  account_id: string;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
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
  | "id"
  | "date"
  | "amount"
  | "account_id"
  | "transfer_account_id"
  | "transfer_transaction_id"
  | "payee_name"
  | "category_name"
  | "flag_color"
  | "flag_name"
  | "cleared"
  | "approved"
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
  isComplete?: boolean;
  requiresFullRefresh?: boolean;
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

export interface SpendingTierSubcategory {
  subcategoryId: string;
  rewardValue: number;
  maximumSpend?: number | null;
}

/**
 * An additional reward level selected by total qualifying card spend. Rates
 * unlock at the configured threshold; caps apply while approaching that
 * threshold, then advance to the next target when it is reached.
 * The card's existing earning fields remain the base level, which keeps
 * cards without spending tiers fully backward compatible.
 */
export interface CardSpendingTier {
  id: string;
  spendThreshold: number;
  earningRate?: number | null;
  maximumSpend?: number | null;
  subcategories?: SpendingTierSubcategory[];
}

/**
 * How the card-wide reward-period minimum is judged.
 * `each_month` is the historical default: every anchored month must hit the
 * target on its own. `whole_period` uses one pot over the full window, the
 * same way a promotional period applies `minimumSpend`.
 */
export type RewardPeriodMinimumScope = "each_month" | "whole_period";

/**
 * A repeating reward period made up of anchored month-long windows. The
 * card-wide minimum either applies to each month or to the whole period;
 * configured subcategory maximums are pooled across the complete window.
 */
export interface CardRewardPeriod {
  monthCount: number;
  anchorDate: string;
  monthlyMinimumSpend: number;
  /** Omitted on legacy records; readers treat that as `each_month`. */
  minimumScope?: RewardPeriodMinimumScope;
}

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: "cashback" | "miles";
  ynabAccountId: string;
  billingCycle?: {
    type: "calendar" | "billing";
    dayOfMonth?: number;
  };
  rewardPeriod?: CardRewardPeriod;
  promotionalPeriod?: {
    // Null is the persisted sentinel for an intentionally omitted start date.
    // Missing is reserved for legacy records that still require migration.
    startDate?: string | null; // ISO 8601 date (YYYY-MM-DD), optional - defaults to current period start
    endDate: string; // ISO 8601 date (YYYY-MM-DD)
    description?: string; // Optional description (e.g., "5x groceries Q4 2024")
  };
  featured: boolean;
  /** A null value is an intentional, persisted "not configured" rate. */
  earningRate?: number | null;
  earningBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  subcategoriesEnabled?: boolean;
  subcategories?: CardSubcategory[];
  spendingTiers?: CardSpendingTier[];
}

// Legacy alias retained for compatibility with existing imports
export type Card = CreditCard;

export interface RewardRule {
  id: string;
  cardId: string;
  name: string;
  rewardType: "cashback" | "miles";
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

export type DashboardViewMode = "summary" | "detailed";

export type HiddenCardReason = "maximum_spend_reached";

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
  countedSpend?: number;
  eligibleSpend: number;
  eligibleSpendBeforeBlocks?: number;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  rewardRate?: number;
  minimumSpend?: number | null;
  minimumSpendMet: boolean;
  maximumSpend?: number | null;
  maximumSpendExceeded: boolean;
  blockSize?: number | null;
  blocksEarned?: number;
}

export type MonthlyQualificationStatus = "met" | "pending" | "failed";

export interface MonthlyQualificationBreakdown {
  start: string;
  end: string;
  spend: number;
  minimumSpend: number;
  status: MonthlyQualificationStatus;
}

export type RewardQualificationStatus =
  | "not_required"
  | "met"
  | "pending"
  | "failed";

export interface RewardCalculation {
  cardId: string;
  ruleId: string;
  period: string;
  totalSpend: number;
  countedSpend?: number;
  eligibleSpend: number;
  eligibleSpendBeforeBlocks?: number;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  rewardType: "cashback" | "miles";
  categoryBreakdowns?: CategoryBreakdown[];
  subcategoryBreakdowns?: SubcategoryBreakdown[];
  minimumSpend?: number | null;
  minimumProgress?: number;
  monthlyMinimumSpend?: number;
  qualificationStatus?: RewardQualificationStatus;
  monthlyQualifications?: MonthlyQualificationBreakdown[];
  rewardPeriodCalculationVersion?: number;
  maximumSpend?: number | null;
  maximumProgress?: number;
  activeSpendingTierId?: string | null;
  spendingTierCalculationVersion?: number;
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

export type LlmProvider = "openai" | "gemini" | "openrouter" | "opencode";
export type StatementFormatterProvider = "openai" | "gemini" | "openrouter";
export type CategoryImportProvider = "openai" | "openrouter" | "opencode";

export interface StatementFormatterSettings {
  provider?: StatementFormatterProvider;
  categoryImportProvider?: CategoryImportProvider;
  modelByProvider?: Partial<Record<LlmProvider, string>>;
  apiKeys?: Partial<Record<LlmProvider, string>>;
  customPrompt?: string;
}

export type SummaryViewSubcategoriesPreference =
  | boolean
  | Record<string, boolean>;

export interface AppSettings {
  theme?: "light" | "dark" | "auto";
  currency?: string;
  milesValuation?: number;
  dashboardViewMode?: DashboardViewMode;
  groupCardsByType?: boolean;
  cloudSyncKeyId?: string;
  cloudSyncLastSyncedAt?: string;
  cloudSyncLocalChangedAt?: string;
  cloudSyncMnemonic?: string;
  rememberCloudSyncCode?: boolean;
  autoSyncEnabled?: boolean;
  cardOrdering?: Partial<Record<"cashback" | "miles" | "all", string[]>>;
  collapsedCardGroups?: Partial<Record<"cashback" | "miles", boolean>>;
  summaryViewSubcategoriesExpanded?: SummaryViewSubcategoriesPreference;
  statementFormatter?: StatementFormatterSettings;
}

export interface DashboardTransactionsCacheEntry {
  budgetId: string;
  sinceDate: string;
  fetchedAt: string;
  trackedAccountIds: string[];
  isComplete?: boolean;
  requiresFullRefresh?: boolean;
  transactions: CachedTransaction[];
  accounts: Array<{ id: string; name: string }>;
}

export interface BudgetAccountsCacheAccount {
  id: string;
  name: string;
  type?: string;
  on_budget?: boolean;
  closed?: boolean;
  balance?: number;
  [key: string]: unknown;
}

export interface BudgetAccountsCacheEntry {
  budgetId: string;
  fetchedAt: string;
  scopeKey?: string;
  accounts: BudgetAccountsCacheAccount[];
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
    accounts?: BudgetAccountsCacheEntry[];
    transactions?: unknown[];
    lastUpdated?: string;
    flagNames?: Partial<Record<YnabFlagColor, string>>;
    dashboardTransactions?: DashboardTransactionsCacheEntry[];
  };
}
