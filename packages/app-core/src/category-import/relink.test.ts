import { describe, expect, it } from 'vitest';

import { relinkSpendingTierOverrides } from './relink';

describe('relinkSpendingTierOverrides', () => {
  it('rewrites overrides when the subcategory id changed but the name matches', () => {
    const next = relinkSpendingTierOverrides({
      spendingTiers: [{
        id: 'tier-1',
        subcategories: [{ subcategoryId: 'old-dining', rewardValue: 10 }],
      }],
      previousSubcategories: [{ id: 'old-dining', name: 'Dining' }],
      nextSubcategories: [{ id: 'new-dining', name: 'dining' }],
    });

    expect(next[0]?.subcategories).toEqual([
      { subcategoryId: 'new-dining', rewardValue: 10 },
    ]);
  });

  it('keeps an override whose id is already on the next subcategory', () => {
    const next = relinkSpendingTierOverrides({
      spendingTiers: [{
        id: 'tier-1',
        subcategories: [{ subcategoryId: 'dining-1', rewardValue: 8 }],
      }],
      previousSubcategories: [{ id: 'dining-1', name: 'Dining' }],
      nextSubcategories: [{ id: 'dining-1', name: 'Dining' }],
    });

    expect(next[0]?.subcategories).toEqual([
      { subcategoryId: 'dining-1', rewardValue: 8 },
    ]);
  });
});
