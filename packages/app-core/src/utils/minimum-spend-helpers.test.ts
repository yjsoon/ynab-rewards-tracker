import { describe, expect, it } from 'vitest';

import {
  calculateMaximumSpendProgress,
  calculateMinimumSpendProgress,
  formatMaximumSpendText,
  formatMinimumSpendText,
  getMaximumSpendStatus,
  getMinimumSpendStatus,
  hasMaximumSpendLimit,
  hasMinimumSpendRequirement,
  isMaximumSpendExceeded,
  isMinimumSpendMet,
} from './minimum-spend-helpers';

describe('minimum and maximum spend helpers', () => {
  it('treats negative minimum spend values as no requirement', () => {
    expect(hasMinimumSpendRequirement(-100)).toBe(false);
    expect(getMinimumSpendStatus(-100)).toBe('no-minimum');
    expect(formatMinimumSpendText(-100)).toBe('No minimum required');
    expect(isMinimumSpendMet(0, -100)).toBe(true);
    expect(calculateMinimumSpendProgress(50, -100)).toBeUndefined();
  });

  it('treats negative maximum spend values as no limit', () => {
    expect(hasMaximumSpendLimit(-100)).toBe(false);
    expect(getMaximumSpendStatus(-100)).toBe('no-limit');
    expect(formatMaximumSpendText(-100)).toBe('No limit');
    expect(isMaximumSpendExceeded(1000, -100)).toBe(false);
    expect(calculateMaximumSpendProgress(50, -100)).toBeUndefined();
  });
});
