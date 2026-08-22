import { describe, expect, it } from 'vitest';

import type { CreditCard } from '@ynab-counter/app-core/storage/types';
import { applyCategoryProposal } from '@ynab-counter/app-core/category-import';

import { applyCategoryPatchToCardForm, type CategoryImportFormFields } from './category-import-form';

function emptyForm(): CategoryImportFormFields {
  return {
    earningRate: '1',
    earningBlockSize: '',
    minimumSpend: '500',
    maximumSpend: '',
    subcategoriesEnabled: false,
    tiers: [],
    spendingTiers: [],
  };
}

const card: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Bank',
  type: 'cashback',
  ynabAccountId: 'acc-1',
  featured: true,
  earningRate: 1,
};

describe('applyCategoryPatchToCardForm', () => {
  it('fills flag tiers and leaves unspecified limits as typed', () => {
    const patch = applyCategoryProposal({
      card,
      proposal: {
        cardType: 'cashback',
        cardLimits: null,
        subcategories: [{
          id: 'sub-1',
          name: 'Dining',
          flagColor: 'red',
          rewardValue: 4,
          milesBlockSize: null,
          minimumSpend: null,
          maximumSpend: 2000,
          priority: 0,
          active: true,
          excludeFromRewards: false,
          createdAt: '2026-08-22T00:00:00.000Z',
          updatedAt: '2026-08-22T00:00:00.000Z',
        }],
        spendingTiers: null,
        notes: ['Foreign currency is 0.5%'],
      },
    });

    const next = applyCategoryPatchToCardForm(emptyForm(), patch);

    expect(next.subcategoriesEnabled).toBe(true);
    expect(next.earningRate).toBe('1');
    expect(next.minimumSpend).toBe('500');
    expect(next.tiers).toMatchObject([
      { name: 'Dining', rewardValue: '4', maximumSpend: '2000', flagColor: 'red' },
    ]);
    expect(next.spendingTiers).toEqual([]);
  });

  it('writes proposed limits and spend tiers into the draft', () => {
    const patch = applyCategoryProposal({
      card: { ...card, type: 'miles' },
      proposal: {
        cardType: 'miles',
        cardLimits: {
          earningRate: 1.4,
          earningBlockSize: 5,
          minimumSpend: null,
          maximumSpend: 20000,
        },
        subcategories: [{
          id: 'sub-2',
          name: 'Everything else',
          flagColor: 'unflagged',
          rewardValue: 1.4,
          milesBlockSize: 5,
          minimumSpend: null,
          maximumSpend: null,
          priority: 0,
          active: true,
          excludeFromRewards: false,
          createdAt: '2026-08-22T00:00:00.000Z',
          updatedAt: '2026-08-22T00:00:00.000Z',
        }],
        spendingTiers: [{ spendThreshold: 2000, earningRate: 4, maximumSpend: null }],
        notes: [],
      },
    });

    const next = applyCategoryPatchToCardForm({
      ...emptyForm(),
      earningRate: '',
      minimumSpend: '100',
    }, patch);

    expect(next.earningRate).toBe('1.4');
    expect(next.earningBlockSize).toBe('5');
    expect(next.minimumSpend).toBe('100');
    expect(next.maximumSpend).toBe('20000');
    expect(next.spendingTiers).toHaveLength(1);
    expect(next.spendingTiers[0]?.spendThreshold).toBe('2000');
  });
});
