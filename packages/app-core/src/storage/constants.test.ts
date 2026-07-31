import { describe, expect, it } from 'vitest';

import { STORAGE_VERSION, shouldResetStorage } from './constants';

describe('storage reset version', () => {
  it('keeps only payloads stamped with the current deliberate-reset version', () => {
    expect(shouldResetStorage(STORAGE_VERSION)).toBe(false);
    expect(shouldResetStorage('older-version')).toBe(true);
    expect(shouldResetStorage(null)).toBe(true);
    expect(shouldResetStorage(undefined)).toBe(true);
  });
});
