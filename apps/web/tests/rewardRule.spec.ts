import { describe, it, expect } from 'vitest';
import { validateRewardRule } from '@/lib/validators/rewardRule';

function baseRule(overrides: Partial<any> = {}) {
  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
  return {
    id: 'r1',
    cardId: 'c1',
    name: 'Test',
    rewardType: 'cashback' as const,
    rewardValue: 1.5,
    categories: ['dining'],
    minimumSpend: 0,
    maximumSpend: 1000,
    startDate: today,
    endDate: nextYear,
    active: true,
    priority: 0,
    ...overrides,
  };
}

describe('rewardRule validation', () => {
  it('accepts a valid cashback rule', () => {
    const res = validateRewardRule(baseRule());
    expect(res.ok).toBe(true);
  });

  it('rejects end date before start date', () => {
    const res = validateRewardRule(baseRule({ startDate: '2025-12-31', endDate: '2025-01-01' }));
    expect(res.ok).toBe(false);
    // @ts-ignore
    expect(res.errors.endDate).toBeTruthy();
  });

  it('rejects miles block size on cashback', () => {
    const res = validateRewardRule(baseRule({ milesBlockSize: 5 }));
    expect(res.ok).toBe(false);
  });

  it('accepts a valid miles rule with block size', () => {
    const res = validateRewardRule(baseRule({ rewardType: 'miles', rewardValue: 2, milesBlockSize: 5 }));
    expect(res.ok).toBe(true);
  });

  it('rejects caps referencing missing categories', () => {
    const res = validateRewardRule(baseRule({ categoryCaps: [{ category: 'online', maxSpend: 100 }] }));
    expect(res.ok).toBe(false);
  });

  it('rejects minimum >= maximum', () => {
    const res = validateRewardRule(baseRule({ minimumSpend: 500, maximumSpend: 500 }));
    expect(res.ok).toBe(false);
  });
});

