import { describe, expect, it } from 'vitest';

import {
  hasSubcategoryMaximum,
  subcategoryRowFillPercent,
  uncappedSubcategoryScale,
} from './subcategory-row-fill';

describe('hasSubcategoryMaximum', () => {
  it('treats only a positive maximum as a cap', () => {
    expect(hasSubcategoryMaximum(600)).toBe(true);
    expect(hasSubcategoryMaximum(0)).toBe(false);
    expect(hasSubcategoryMaximum(null)).toBe(false);
    expect(hasSubcategoryMaximum(undefined)).toBe(false);
  });
});

describe('uncappedSubcategoryScale', () => {
  it('uses the largest uncapped spend and ignores capped rows', () => {
    expect(uncappedSubcategoryScale([
      { totalSpend: 179 },
      { totalSpend: 140 },
      { totalSpend: 400, maximumSpend: 500 },
      { totalSpend: 29 },
    ])).toBe(179);
  });

  it('is 0 when every row is capped or empty', () => {
    expect(uncappedSubcategoryScale([
      { totalSpend: 400, maximumSpend: 500 },
      { totalSpend: 0 },
    ])).toBe(0);
  });
});

describe('subcategoryRowFillPercent', () => {
  it('fills the largest uncapped row and scales the rest against it', () => {
    const scale = uncappedSubcategoryScale([
      { totalSpend: 179 },
      { totalSpend: 177 },
      { totalSpend: 140 },
      { totalSpend: 97 },
      { totalSpend: 55 },
      { totalSpend: 29 },
    ]);

    expect(subcategoryRowFillPercent({ totalSpend: 179, uncappedScale: scale })).toBe(100);
    expect(subcategoryRowFillPercent({ totalSpend: 177, uncappedScale: scale })).toBeCloseTo(98.88, 1);
    expect(subcategoryRowFillPercent({ totalSpend: 140, uncappedScale: scale })).toBeCloseTo(78.21, 1);
    expect(subcategoryRowFillPercent({ totalSpend: 29, uncappedScale: scale })).toBeCloseTo(16.2, 1);
  });

  it('keeps capped rows on their own maximum', () => {
    expect(subcategoryRowFillPercent({
      totalSpend: 90,
      maximumSpend: 100,
      uncappedScale: 400,
    })).toBe(90);

    expect(subcategoryRowFillPercent({
      totalSpend: 150,
      maximumSpend: 100,
      uncappedScale: 400,
    })).toBe(100);
  });

  it('does not use a large capped spend to shrink uncapped bars', () => {
    const scale = uncappedSubcategoryScale([
      { totalSpend: 5000, maximumSpend: 5000 },
      { totalSpend: 200 },
      { totalSpend: 80 },
    ]);

    expect(scale).toBe(200);
    expect(subcategoryRowFillPercent({ totalSpend: 200, uncappedScale: scale })).toBe(100);
    expect(subcategoryRowFillPercent({ totalSpend: 80, uncappedScale: scale })).toBe(40);
    expect(subcategoryRowFillPercent({
      totalSpend: 5000,
      maximumSpend: 5000,
      uncappedScale: scale,
    })).toBe(100);
  });

  it('returns 0 when there is nothing to scale', () => {
    expect(subcategoryRowFillPercent({ totalSpend: 0, uncappedScale: 179 })).toBe(0);
    expect(subcategoryRowFillPercent({ totalSpend: 50, uncappedScale: 0 })).toBe(0);
    expect(subcategoryRowFillPercent({
      totalSpend: 0,
      maximumSpend: 100,
      uncappedScale: 0,
    })).toBe(0);
  });
});
