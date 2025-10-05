import type { YnabFlagColor } from '@/lib/ynab-constants';

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
  };
}
