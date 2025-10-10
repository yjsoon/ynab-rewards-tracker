import { useMemo } from 'react';
import {
  SimpleRewardsCalculator,
  RecommendationEngine,
  type SimplePeriod,
  type SimplifiedCalculation,
  type CardRecommendation,
  type Transaction,
  type CreditCard,
  type AppSettings,
  type RewardCalculation,
} from '@ynab-counter/app-core';
import { createRewardCalculationFromSimple } from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';

interface DisplayTransaction {
  id: string;
  date: string;
  amount: number;
  payeeName: string;
  category: string;
}

const ACCOUNT_ID = 'demo-account-1';

const DEMO_CARD: CreditCard = {
  id: 'demo-card-1',
  name: 'Chase Freedom Flex',
  issuer: 'Chase',
  type: 'cashback',
  ynabAccountId: ACCOUNT_ID,
  billingCycle: { type: 'calendar' },
  featured: true,
  earningRate: 5,
  earningBlockSize: null,
  minimumSpend: 500,
  maximumSpend: 1500,
  subcategoriesEnabled: false,
  subcategories: [],
};

const DEMO_SETTINGS: AppSettings = {
  currency: 'USD',
  milesValuation: 0.0125,
  dashboardViewMode: 'summary',
};

export function useDemoRewards() {
  const transactions = useMemo<DisplayTransaction[]>(
    () => [
      {
        id: 'txn-1',
        date: new Date().toISOString().split('T')[0],
        amount: -12500, // -$12.50
        payeeName: 'Whole Foods',
        category: 'Groceries',
      },
      {
        id: 'txn-2',
        date: new Date(Date.now() - 86_400_000).toISOString().split('T')[0],
        amount: -8900, // -$8.90
        payeeName: 'Starbucks',
        category: 'Dining Out',
      },
      {
        id: 'txn-3',
        date: new Date(Date.now() - 172_800_000).toISOString().split('T')[0],
        amount: -15000, // -$15.00
        payeeName: 'Target',
        category: 'Groceries',
      },
    ],
    []
  );

  const ynabTransactions = useMemo<Transaction[]>(
    () =>
      transactions.map((txn) => ({
        id: txn.id,
        date: txn.date,
        amount: txn.amount,
        account_id: ACCOUNT_ID,
        flag_color: null,
      })),
    [transactions]
  );

  const period = useMemo<SimplePeriod>(
    () => SimpleRewardsCalculator.calculatePeriod(DEMO_CARD),
    []
  );

  const calculation = useMemo<SimplifiedCalculation>(
    () =>
      SimpleRewardsCalculator.calculateCardRewards(
        DEMO_CARD,
        ynabTransactions,
        period,
        DEMO_SETTINGS
      ),
    [ynabTransactions, period]
  );

  const effectiveRate = useMemo(
    () => SimpleRewardsCalculator.calculateEffectiveRate(calculation),
    [calculation]
  );

  const rewardCalculation = useMemo<RewardCalculation>(
    () => createRewardCalculationFromSimple(DEMO_CARD, calculation),
    [calculation]
  );

  const recommendations = useMemo<CardRecommendation[]>(
    () => RecommendationEngine.generateCardRecommendations([DEMO_CARD], [rewardCalculation]),
    [rewardCalculation]
  );

  return {
    card: DEMO_CARD,
    calculation,
    period,
    effectiveRate,
    recommendations,
    transactions,
  };
}