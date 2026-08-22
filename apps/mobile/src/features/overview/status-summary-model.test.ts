import { describe, expect, it } from 'vitest';

import {
  buildRewardsDashboard,
  type CardDashboardProjection,
  type CardPortfolioStatus,
} from '@ynab-counter/app-core/rewards-engine';
import type {
  CreditCard,
  RewardQualificationStatus,
  Transaction,
} from '@ynab-counter/app-core/storage';

import { summariseDashboardStatus } from './status-summary-model';

const NOW = new Date(2026, 7, 14, 12);

function createCard(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'card-1',
    name: 'Test Card',
    issuer: 'Bank',
    type: 'cashback',
    ynabAccountId: 'account-1',
    featured: true,
    earningRate: 2,
    ...overrides,
  };
}

function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    account_id: 'account-1',
    amount: -50_000,
    date: '2026-08-01',
    ...overrides,
  };
}

function project(options: {
  card?: Partial<CreditCard>;
  status?: CardPortfolioStatus;
  qualificationStatus?: RewardQualificationStatus;
}): CardDashboardProjection {
  const card = createCard(options.card);
  const dashboard = buildRewardsDashboard(
    [card],
    [createTransaction({ account_id: card.ynabAccountId })],
    {},
    NOW,
  );
  const base = dashboard.cards[0];
  if (!base) {
    throw new Error('expected a dashboard projection');
  }

  return {
    ...base,
    status: options.status ?? base.status,
    calculation: {
      ...base.calculation,
      qualificationStatus:
        options.qualificationStatus ?? base.calculation.qualificationStatus,
    },
  };
}

describe('summariseDashboardStatus', () => {
  it('returns zeros when there are no projections', () => {
    expect(summariseDashboardStatus([])).toEqual({
      'qualification-failed': 0,
      'below-minimum': 0,
      earning: 0,
      'near-cap': 0,
      'at-cap': 0,
    });
  });

  it('counts a failed qualification ahead of any other status', () => {
    expect(summariseDashboardStatus([
      project({ status: 'capped', qualificationStatus: 'failed' }),
    ])).toEqual({
      'qualification-failed': 1,
      'below-minimum': 0,
      earning: 0,
      'near-cap': 0,
      'at-cap': 0,
    });
  });

  it('maps capped, near-cap, and building statuses', () => {
    expect(summariseDashboardStatus([
      project({ card: { id: 'capped' }, status: 'capped' }),
      project({ card: { id: 'near' }, status: 'near_cap' }),
      project({ card: { id: 'building' }, status: 'building' }),
    ])).toEqual({
      'qualification-failed': 0,
      'below-minimum': 1,
      earning: 0,
      'near-cap': 1,
      'at-cap': 1,
    });
  });

  it('folds earning and open into the earning slot', () => {
    expect(summariseDashboardStatus([
      project({ card: { id: 'earning' }, status: 'earning' }),
      project({ card: { id: 'open' }, status: 'open' }),
    ])).toEqual({
      'qualification-failed': 0,
      'below-minimum': 0,
      earning: 2,
      'near-cap': 0,
      'at-cap': 0,
    });
  });

  it('skips unconfigured cards', () => {
    expect(summariseDashboardStatus([
      project({
        card: { id: 'setup', earningRate: null },
        status: 'unconfigured',
      }),
      project({ card: { id: 'open' }, status: 'open' }),
    ])).toEqual({
      'qualification-failed': 0,
      'below-minimum': 0,
      earning: 1,
      'near-cap': 0,
      'at-cap': 0,
    });
  });
});
