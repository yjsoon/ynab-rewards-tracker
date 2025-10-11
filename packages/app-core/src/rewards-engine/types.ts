import type { CreditCard } from '../storage/types';

export interface CardRecommendation {
  cardId: string;
  cardName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  action: 'use' | 'avoid' | 'consider';
}

export interface CategoryCardInsight {
  cardId: string;
  cardName: string;
  cardType: CreditCard['type'];
  rewardRate: number;
  rewardEarnedDollars: number;
  totalSpend: number;
  eligibleSpend: number;
  eligibleSpendBeforeBlocks: number;
  hasData: boolean;
  minimumMet: boolean;
  minimumProgress?: number | null;
  minimumTarget?: number | null;
  minimumRemaining?: number | null;
  cardMinimumMet: boolean;
  cardMinimumProgress?: number | null;
  maximumCap?: number | null;
  maximumProgress?: number | null;
  headroomToMaximum?: number | null;
  cardMaximumProgress?: number | null;
  cardMaximumCap?: number | null;
  cardMaximumExceeded: boolean;
  status: 'use' | 'consider' | 'avoid';
  shouldAvoid: boolean;
  notes?: string[];
}

export interface CategoryRecommendation {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  latestPeriod?: string;
  insights: CategoryCardInsight[];
}