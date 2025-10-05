import { describe, expect, it } from 'vitest';

import type { CreditCard, RewardCalculation } from '@/lib/storage';

import type { CardRecommendation } from '../types';
import {
  EFFECTIVE_RATE_GOOD_THRESHOLD,
  MINIMUM_PROGRESS_ALERT_THRESHOLD,
  MINIMUM_PROGRESS_ATTENTION_THRESHOLD,
  getAlertRecommendations,
  getCardRecommendations,
} from './card-recommendations';

const createCard = (overrides: Partial<CreditCard>): CreditCard => ({
  id: 'card-1',
  name: 'Rewards Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
  ...overrides,
});

const createCalculation = (overrides: Partial<RewardCalculation>): RewardCalculation => ({
  cardId: 'card-1',
  ruleId: 'rule-1',
  period: '2025-01',
  totalSpend: 0,
  eligibleSpend: 0,
  rewardEarned: 0,
  rewardType: 'cashback',
  minimumMet: false,
  maximumExceeded: false,
  shouldStopUsing: false,
  ...overrides,
});

const getActions = (recs: CardRecommendation[]): string[] => recs.map((rec) => `${rec.cardId}:${rec.action}:${rec.priority}`);

describe('getCardRecommendations', () => {
  it('returns low priority consider recommendation when no activity', () => {
    const recs = getCardRecommendations([createCard({ id: 'card-1' })], []);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      priority: 'low',
      action: 'consider',
      reason: 'No activity this period',
    });
  });

  it('flags cards that should stop being used', () => {
    const recs = getCardRecommendations(
      [createCard({ id: 'card-1' })],
      [createCalculation({ cardId: 'card-1', shouldStopUsing: true })]
    );
    expect(getActions(recs)).toEqual(['card-1:avoid:high']);
  });

  it('prioritises minimum spend progress', () => {
    const progress = (MINIMUM_PROGRESS_ATTENTION_THRESHOLD + 100) / 2;
    const recs = getCardRecommendations(
      [createCard({ id: 'card-1' })],
      [createCalculation({ cardId: 'card-1', minimumProgress: progress, eligibleSpend: 1 })]
    );
    expect(recs[0]).toMatchObject({ action: 'use', priority: 'medium' });
  });

  it('recommends cards exceeding effective reward threshold', () => {
    const rate = EFFECTIVE_RATE_GOOD_THRESHOLD + 0.01;
    const rewardEarnedDollars = rate * 200;
    const recs = getCardRecommendations(
      [createCard({ id: 'card-1' })],
      [
        createCalculation({
          cardId: 'card-1',
          eligibleSpend: 200,
          rewardEarnedDollars,
        }),
      ]
    );
    expect(recs[0]).toMatchObject({ action: 'use', priority: 'medium' });
    expect(recs[0].reason).toContain('Good reward rate');
  });

  it('sorts recommendations by priority', () => {
    const cards = [
      createCard({ id: 'card-1' }),
      createCard({ id: 'card-2' }),
      createCard({ id: 'card-3' }),
    ];
    const calculations = [
      createCalculation({ cardId: 'card-1', shouldStopUsing: true }),
      createCalculation({ cardId: 'card-2', minimumProgress: MINIMUM_PROGRESS_ATTENTION_THRESHOLD + 1, eligibleSpend: 1 }),
      createCalculation({ cardId: 'card-3', eligibleSpend: 200, rewardEarnedDollars: (EFFECTIVE_RATE_GOOD_THRESHOLD + 0.01) * 200 }),
    ];

    const actions = getActions(getCardRecommendations(cards, calculations));
    expect(actions).toEqual([
      'card-1:avoid:high',
      'card-2:use:medium',
      'card-3:use:medium',
    ]);
  });
});

describe('getAlertRecommendations', () => {
  it('includes alerts for maximum spend and minimum progress', () => {
    const alerts = getAlertRecommendations(
      [createCard({ id: 'card-1' })],
      [
        createCalculation({
          cardId: 'card-1',
          shouldStopUsing: true,
          minimumProgress: MINIMUM_PROGRESS_ALERT_THRESHOLD - 10,
        }),
      ]
    );

    expect(alerts).toHaveLength(2);
    expect(getActions(alerts)).toEqual([
      'card-1:avoid:high',
      `card-1:use:medium`,
    ]);
  });

  it('ignores minimum progress alerts when above threshold', () => {
    const alerts = getAlertRecommendations(
      [createCard({ id: 'card-1' })],
      [createCalculation({ cardId: 'card-1', minimumProgress: MINIMUM_PROGRESS_ALERT_THRESHOLD })]
    );

    expect(alerts).toHaveLength(0);
  });
});
