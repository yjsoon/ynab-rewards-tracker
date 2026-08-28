import { describe, expect, it } from 'vitest';

import type { CreditCard } from '@/lib/storage';

import { buildRewardPeriodFromEditState, computeCardFieldDiff } from './CardSettingsEditor';

const card: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
  earningRate: 2,
};

describe('CardSettingsEditor reward-period fields', () => {
  it('keeps untouched monthly cards backward compatible', () => {
    expect(computeCardFieldDiff(card, {}).rewardPeriod).toBe(false);
  });

  it('tracks enabling and editing the compact multi-month configuration', () => {
    expect(computeCardFieldDiff(card, {
      rewardPeriodEnabled: true,
      rewardPeriodMonthCount: 3,
      rewardPeriodAnchorDate: '2026-01-01',
      rewardPeriodMonthlyMinimum: 800,
    }).rewardPeriod).toBe(true);

    const configured: CreditCard = {
      ...card,
      rewardPeriod: {
        monthCount: 3,
        anchorDate: '2026-01-01',
        monthlyMinimumSpend: 800,
      },
    };
    expect(computeCardFieldDiff(configured, {
      rewardPeriodEnabled: true,
      rewardPeriodMonthCount: 3,
      rewardPeriodAnchorDate: '2026-01-01',
      rewardPeriodMonthlyMinimum: 800,
    }).rewardPeriod).toBe(false);

    expect(computeCardFieldDiff(configured, {
      rewardPeriodEnabled: true,
      rewardPeriodMonthCount: 3,
      rewardPeriodAnchorDate: '2026-01-01',
      rewardPeriodMonthlyMinimum: 800,
      rewardPeriodMinimumScope: 'whole_period',
    }).rewardPeriod).toBe(true);
  });

  it('persists a one-off window with a period pot', () => {
    expect(buildRewardPeriodFromEditState({
      rewardPeriodEnabled: true,
      rewardPeriodKind: 'one_off',
      rewardPeriodAnchorDate: '2026-01-01',
      rewardPeriodEndDate: '2026-03-31',
      rewardPeriodMonthlyMinimum: 1000,
      rewardPeriodMinimumScope: 'whole_period',
    })).toEqual({
      monthCount: 3,
      anchorDate: '2026-01-01',
      endDate: '2026-03-31',
      monthlyMinimumSpend: 1000,
      minimumScope: 'whole_period',
    });
  });
});
