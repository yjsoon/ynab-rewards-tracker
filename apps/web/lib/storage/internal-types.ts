import type {
  AppSettings,
  CardReference,
  CardSubcategory,
  CategoryBreakdown,
  CreditCard,
  HiddenCard,
  RewardCalculation,
  RewardRule,
  StorageData,
  SubcategoryReference,
  ThemeGroup,
} from './types';

export type MutableCard = CreditCard & Record<string, unknown> & { active?: boolean };
export type MutableSubcategory = CardSubcategory & Record<string, unknown>;
export type MutableRule = RewardRule & Record<string, unknown>;
export type MutableCalculation = RewardCalculation & Record<string, unknown>;
export type MutableCategoryBreakdown = CategoryBreakdown & Record<string, unknown>;
export type MutableSettings = AppSettings & Record<string, unknown>;
export type MutableSubcategoryReference = SubcategoryReference & Record<string, unknown>;
export type MutableCardReference = CardReference & Record<string, unknown>;
export type MutableThemeGroup = ThemeGroup & Record<string, unknown>;

export interface MutableStorageData extends StorageData {
  themeGroups: ThemeGroup[];
  hiddenCards?: HiddenCard[];
  cachedData?: StorageData['cachedData'];
}
