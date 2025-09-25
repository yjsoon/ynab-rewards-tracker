/**
 * Rewards engine main exports
 */

export { RewardsCalculator } from './calculator';
export { SimpleRewardsCalculator } from './simple-calculator';
export { TransactionMatcher } from './matcher';
export { RecommendationEngine } from './recommendations';

export type { CalculationPeriod } from './calculator';
export type { CalculationPeriod as SimplePeriod, SimplifiedCalculation } from './simple-calculator';
export type {
  CardRecommendation,
  CategoryCardInsight,
  CategoryRecommendation,
} from './recommendations';
