import { describe, expect, it } from 'vitest';

import { UNFLAGGED_FLAG } from '../ynab/constants';
import { compileCategoryImport } from './compile';
import type { CategoryBucketDraft } from './types';

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

describe('compileCategoryImport', () => {
  it('assigns unique flags and always keeps an unflagged fallback', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining'), bucket('Groceries')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'miles',
      earningRate: 1.4,
    });

    const flags = proposal.subcategories.map((subcategory) => subcategory.flagColor);
    expect(new Set(flags).size).toBe(flags.length);
    expect(flags).toContain(UNFLAGGED_FLAG.value);
    expect(proposal.subcategories.find((subcategory) => subcategory.flagColor === UNFLAGGED_FLAG.value)?.rewardValue).toBe(1.4);
  });

  it('reuses an existing flag when the name matches', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
      existingSubcategories: [{ name: 'Dining', flagColor: 'green' }],
    });

    expect(proposal.subcategories[0]).toMatchObject({ name: 'Dining', flagColor: 'green' });
  });

  it('keeps an existing subcategory id so spend-tier refs survive', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
      existingSubcategories: [{
        id: 'sub-dining',
        name: 'dining',
        flagColor: 'blue',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    });

    expect(proposal.subcategories[0]).toMatchObject({
      id: 'sub-dining',
      flagColor: 'blue',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('puts merchant inclusion into notes', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [{ ...bucket('Dining'), inclusion: 'restaurants and cafes' }],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    expect(proposal.notes).toContain('Dining includes restaurants and cafes');
  });

  it('treats a hyphenated catch-all name as the unflagged fallback', () => {
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining'), { ...bucket('Catch-All'), rewardValue: 0.3 }],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    expect(proposal.subcategories.find((subcategory) => (
      subcategory.flagColor === UNFLAGGED_FLAG.value
    ))).toMatchObject({
      name: 'Catch-All',
      rewardValue: 0.3,
    });
  });

  it('moves an eighth earning bucket into notes', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const proposal = compileCategoryImport({
      parsed: {
        cardLimits: null,
        buckets: names.map((name) => bucket(name)),
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    expect(proposal.subcategories.filter((subcategory) => subcategory.flagColor !== UNFLAGGED_FLAG.value)).toHaveLength(6);
    expect(proposal.notes.some((note) => note.includes('H'))).toBe(true);
  });
});
