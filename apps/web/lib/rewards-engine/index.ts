/**
 * Rewards engine main exports
 */

export { RewardsCalculator } from './calculator';
export { TransactionMatcher } from './matcher';
export { RecommendationEngine } from './recommendations';

export type { CalculationPeriod } from './calculator';
export type { 
  CardRecommendation, 
  CategoryRecommendation 
} from './recommendations';