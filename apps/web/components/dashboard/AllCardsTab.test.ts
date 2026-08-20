import { describe, expect, it } from 'vitest';

import type { CreditCard } from '@/lib/storage';
import { createCardEditState, isValidDateValue } from './AllCardsTab';

const card: CreditCard = {
  id: 'card-1',
  name: 'Promotion Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
  promotionalPeriod: {
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    description: 'Launch offer',
  },
};

describe('All Cards reward-period editing', () => {
  it('initialises the complete promotion draft alongside reward-period fields', () => {
    expect(createCardEditState(card)).toMatchObject({
      promotionalPeriodEnabled: true,
      promotionalPeriodStart: '2026-01-01',
      promotionalPeriodEnd: '2026-03-31',
      promotionalPeriodDescription: 'Launch offer',
      rewardPeriodEnabled: false,
    });
  });

  it('accepts only real ISO calendar dates as reward-period anchors', () => {
    expect(isValidDateValue('2026-02-28')).toBe(true);
    expect(isValidDateValue('2026-02-30')).toBe(false);
    expect(isValidDateValue('')).toBe(false);
  });
});
