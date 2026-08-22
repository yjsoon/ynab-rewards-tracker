import { describe, expect, it } from 'vitest';

import { UNFLAGGED_FLAG } from '../ynab/constants';
import { compileCategoryProposal } from './compile';
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

describe('compileCategoryProposal', () => {
  it('assigns unique flags and always keeps an unflagged fallback', () => {
    const proposal = compileCategoryProposal({
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
    expect(flags).toEqual(['red', 'orange', 'unflagged']);
    expect(new Set(flags).size).toBe(flags.length);
    expect(flags).toContain(UNFLAGGED_FLAG.value);
    expect(proposal.subcategories.find((subcategory) => subcategory.flagColor === UNFLAGGED_FLAG.value)?.rewardValue).toBe(1.4);
    expect(proposal.subcategories[0]).not.toHaveProperty('id');
  });

  it('reserves unflagged for a named catch-all in model order', () => {
    const proposal = compileCategoryProposal({
      parsed: {
        cardLimits: null,
        buckets: [bucket('Dining'), bucket('Everything else', 0.3), bucket('Travel')],
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    expect(proposal.subcategories.map(({ name, flagColor }) => ({ name, flagColor }))).toEqual([
      { name: 'Dining', flagColor: 'red' },
      { name: 'Everything else', flagColor: 'unflagged' },
      { name: 'Travel', flagColor: 'orange' },
    ]);
  });

  it('puts merchant inclusion into notes', () => {
    const proposal = compileCategoryProposal({
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
    const proposal = compileCategoryProposal({
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
    const proposal = compileCategoryProposal({
      parsed: {
        cardLimits: null,
        buckets: names.map((name) => bucket(name)),
        spendingTiers: null,
        notes: [],
      },
      cardType: 'cashback',
    });

    expect(proposal.subcategories.filter((subcategory) => subcategory.flagColor !== UNFLAGGED_FLAG.value)).toHaveLength(6);
    expect(proposal.notes.some((note) => note.includes('G'))).toBe(true);
    expect(proposal.notes.some((note) => note.includes('H'))).toBe(true);
  });
});
