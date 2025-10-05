import { describe, expect, it } from 'vitest';

import type { CardSubcategory, CreditCard } from '@/lib/storage';

import { applyBlock, getBlockSize, getRewardRate } from './reward-math';

const baseCard: CreditCard = {
  id: 'card-1',
  name: 'Card',
  issuer: 'Issuer',
  type: 'cashback',
  ynabAccountId: 'account-1',
  featured: true,
  earningRate: 1.5,
};

const createSubcategory = (overrides: Partial<CardSubcategory>): CardSubcategory => ({
  id: overrides.id ?? 'sub',
  name: overrides.name ?? 'Sub',
  flagColor: overrides.flagColor ?? 'blue',
  rewardValue: overrides.rewardValue ?? 3,
  milesBlockSize: overrides.milesBlockSize ?? null,
  minimumSpend: overrides.minimumSpend ?? null,
  maximumSpend: overrides.maximumSpend ?? null,
  priority: overrides.priority ?? 0,
  active: overrides.active ?? true,
  excludeFromRewards: overrides.excludeFromRewards,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

describe('getBlockSize', () => {
  it('prefers subcategory block size for miles cards', () => {
    const card: CreditCard = { ...baseCard, type: 'miles', earningBlockSize: 50 };
    const subcategory = createSubcategory({ milesBlockSize: 25 });
    expect(getBlockSize(card, subcategory)).toBe(25);
  });

  it('falls back to card block size or null', () => {
    const card: CreditCard = { ...baseCard, earningBlockSize: 100 };
    expect(getBlockSize(card)).toBe(100);
    expect(getBlockSize({ ...baseCard, earningBlockSize: null })).toBeNull();
  });
});

describe('getRewardRate', () => {
  it('uses subcategory reward rate when available', () => {
    const subcategory = createSubcategory({ rewardValue: 5 });
    expect(getRewardRate(baseCard, subcategory)).toBe(5);
  });

  it('defaults to card earning rate', () => {
    expect(getRewardRate(baseCard)).toBe(1.5);
    expect(getRewardRate({ ...baseCard, earningRate: undefined })).toBe(0);
  });
});

describe('applyBlock', () => {
  it('returns original amount when block size is missing or invalid', () => {
    expect(applyBlock(120, null)).toEqual({ amount: 120, blocks: 0 });
    expect(applyBlock(120, 0)).toEqual({ amount: 120, blocks: 0 });
  });

  it('rounds down to whole blocks and returns count', () => {
    expect(applyBlock(105, 25)).toEqual({ amount: 100, blocks: 4 });
  });
});
