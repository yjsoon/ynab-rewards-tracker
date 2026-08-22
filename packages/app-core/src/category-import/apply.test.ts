import { describe, expect, it } from 'vitest';

import type { CardSubcategory, CreditCard } from '../storage/types';
import { applyCategoryProposal } from './apply';
import { compileCategoryProposal } from './compile';
import type { CategoryBucketDraft } from './types';

const card: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Bank',
  type: 'cashback',
  ynabAccountId: 'acc-1',
  featured: true,
  billingCycle: { type: 'billing', dayOfMonth: 12 },
  promotionalPeriod: { startDate: '2026-01-01', endDate: '2026-12-31' },
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
    const proposal = compileCategoryProposal({
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
    expect(patch).not.toHaveProperty('billingCycle');
    expect(patch).not.toHaveProperty('promotionalPeriod');
    expect(patch).not.toHaveProperty('name');
    expect(patch.subcategories.every((subcategory) => subcategory.id.length > 0)).toBe(true);
    expect(new Set(patch.subcategories.map((subcategory) => subcategory.id)).size).toBe(
      patch.subcategories.length,
    );
  });

  it('writes card limits and spend tiers only when proposed', () => {
    const proposal = compileCategoryProposal({
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
    expect(patch.maximumSpend).toBeNull();
    expect(patch.spendingTiers).toHaveLength(1);
    expect(patch.spendingTiers?.[0]?.spendThreshold).toBe(2000);
  });

  it('creates new subcategory ids instead of reusing persisted ids', () => {
    const proposal = compileCategoryProposal({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });
    const existing: CardSubcategory = {
      id: 'persisted-dining',
      name: 'Dining',
      flagColor: 'red',
      rewardValue: 4,
      priority: 0,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const patch = applyCategoryProposal({
      card: { ...card, subcategories: [existing] },
      proposal,
    });

    expect(patch.subcategories[0].id).not.toBe(existing.id);
  });

});
