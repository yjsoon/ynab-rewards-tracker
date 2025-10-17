/**
 * Rewards engine main exports
 */

export { RewardsCalculator } from './calculator';
export { SimpleRewardsCalculator } from './simple-calculator';
export type { Transaction, TransactionWithRewards } from '../storage/types';
export { TransactionMatcher } from './matcher';
export { RecommendationEngine } from './recommendations';
export { computeCurrentPeriod } from './compute';

export type { CalculationPeriod } from './calculator';
export type { CalculationPeriod as SimplePeriod, SimplifiedCalculation, SubcategoryCalculation } from './simple-calculator';
export type {
  CardRecommendation,
  CategoryCardInsight,
  CategoryRecommendation,
} from './types';