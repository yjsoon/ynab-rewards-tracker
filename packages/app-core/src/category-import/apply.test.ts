import { describe, expect, it } from 'vitest';

import type { CreditCard } from '../storage/types';
import { applyCategoryProposal } from './apply';
import { compileCategoryImport } from './compile';
import type { CategoryBucketDraft } from './types';

const card: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Bank',
  type: 'cashback',
  ynabAccountId: 'acc-1',
  featured: true,
  earningRate: 1,
  minimumSpend: 500,
  maximumSpend: 8000,
};

function bucket(name: string, rewardValue = 4): CategoryBucketDraft {
  return {
    name,
    rewardValue,
    milesBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
    excludeFromRewards: false,
    inclusion: null,
  };
}

describe('applyCategoryProposal', () => {
  it('enables subcategories and leaves unspecified card limits alone', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    const patch = applyCategoryProposal({ card, proposal });
    expect(patch.subcategoriesEnabled).toBe(true);
    expect(patch.subcategories.length).toBeGreaterThan(0);
    expect(patch.earningRate).toBeUndefined();
    expect(patch.minimumSpend).toBeUndefined();
    expect(patch.maximumSpend).toBeUndefined();
    expect(patch.spendingTiers).toBeUndefined();
  });

  it('writes card limits and spend tiers only when proposed', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: { earningRate: 1.4, earningBlockSize: 5, minimumSpend: 800, maximumSpend: null },
        buckets: [bucket('Dining')],
        spendingTiers: [{ spendThreshold: 2000, earningRate: 4, maximumSpend: 4000 }],
        notes: [],
      },
      cardType: 'miles',
    });

    const patch = applyCategoryProposal({ card: { ...card, type: 'miles' }, proposal });
    expect(patch.earningRate).toBe(1.4);
    expect(patch.earningBlockSize).toBe(5);
    expect(patch.minimumSpend).toBe(800);
    expect(patch.maximumSpend).toBeUndefined();
    expect(patch.spendingTiers).toHaveLength(1);
    expect(patch.spendingTiers?.[0]?.spendThreshold).toBe(2000);
  });

  it('restores persisted subcategory ids so spend-tier links stay valid', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    const patch = applyCategoryProposal({
      card: {
        ...card,
        subcategories: [{
          id: 'dining-1',
          name: 'Dining',
          flagColor: 'red',
          rewardValue: 4,
          milesBlockSize: null,
          minimumSpend: null,
          maximumSpend: null,
          priority: 0,
          active: true,
          excludeFromRewards: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }],
        spendingTiers: [{
          id: 'tier-1',
          spendThreshold: 2000,
          earningRate: 8,
          maximumSpend: null,
          subcategories: [{ subcategoryId: 'dining-1', rewardValue: 10, maximumSpend: 500 }],
        }],
      },
      proposal,
    });

    expect(patch.subcategories.find((subcategory) => subcategory.name === 'Dining')?.id).toBe('dining-1');
    expect(patch.spendingTiers).toBeUndefined();
  });
});
