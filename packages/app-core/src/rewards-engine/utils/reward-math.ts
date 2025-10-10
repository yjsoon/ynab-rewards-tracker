import type { CardSubcategory, CreditCard } from '../../storage/types';

export interface BlockResult {
  amount: number;
  blocks: number;
}

export function getBlockSize(card: CreditCard, subcategory?: CardSubcategory | undefined): number | null {
  if (
    card.type === 'miles' &&
    subcategory &&
    subcategory.milesBlockSize &&
    subcategory.milesBlockSize > 0
  ) {
    return subcategory.milesBlockSize;
  }

  if (card.earningBlockSize && card.earningBlockSize > 0) {
    return card.earningBlockSize;
  }

  return null;
}

export function getRewardRate(card: CreditCard, subcategory?: CardSubcategory | undefined): number {
  if (subcategory && typeof subcategory.rewardValue === 'number') {
    return subcategory.rewardValue;
  }

  return typeof card.earningRate === 'number' ? card.earningRate : 0;
}

export function applyBlock(eligibleAmount: number, blockSize: number | null): BlockResult {
  if (!blockSize || blockSize <= 0) {
    return { amount: eligibleAmount, blocks: 0 };
  }

  const blocks = Math.floor(eligibleAmount / blockSize);
  return {
    amount: blocks * blockSize,
    blocks,
  };
}