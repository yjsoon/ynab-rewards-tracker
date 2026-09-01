/**
 * Rewards engine main exports
 */

export { RewardsCalculator } from './calculator';
export { SimpleRewardsCalculator } from './simple-calculator';
export {
  buildRewardsDashboard,
  buildTransactionProjections,
  NEAR_CAP_RATIO,
  projectRewardCategories,
  projectRewardsPortfolio,
  projectTransactions,
  resolveActiveMinimumProgress,
} from './dashboard-projection';
export type { Transaction, TransactionWithRewards } from '../storage/types';
export { TransactionMatcher } from './matcher';
export { RecommendationEngine } from './recommendations';
export { computeCurrentPeriod } from './compute';
export {
  createSpendingTier,
  getCardSpendingLevels,
  resolveCardSpendingTier,
} from './utils/spending-tiers';
export {
  summariseMonthlyQualificationProgress,
} from './utils/qualification-progress';

export type { CalculationPeriod } from './calculator';
export type {
  CalculationPeriod as SimplePeriod,
  SimplifiedCalculation,
  SubcategoryCalculation,
  TransactionRewardBlock,
  TransactionRewardReason,
  TransactionRewardResult,
} from './simple-calculator';
export type {
  AccountNameLookup,
  ActiveMinimumProgress,
  CardBlockProjection,
  CardDashboardProjection,
  CardPortfolioStatus,
  CardProgressProjection,
  CardRewardProjection,
  CardStatusCounts,
  MaximumThresholdProjection,
  RewardCategoryBlockProjection,
  RewardCategoryProjection,
  RewardsDashboardProjection,
  RewardsPortfolioTotals,
  SpendProjection,
  ThresholdProjection,
  TransactionProjection,
  TransactionProjectionStatus,
  TransactionRewardProjection,
} from './dashboard-projection';
export type {
  CardRecommendation,
  CategoryCardInsight,
  CategoryRecommendation,
} from './types';
export type {
  CardSpendingLevel,
  ResolvedCardSpendingTier,
} from './utils/spending-tiers';
export type {
  MonthlyQualificationProgress,
} from './utils/qualification-progress';
