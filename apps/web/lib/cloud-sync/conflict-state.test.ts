import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearCloudSyncConflict,
  CLOUD_SYNC_CONFLICT_EVENT,
  CLOUD_SYNC_CONFLICT_STORAGE_KEY,
  hasCloudSyncConflict,
  markCloudSyncConflict,
} from './conflict-state';

describe('cloud sync conflict state', () => {
  const values = new Map<string, string>();
  const dispatchEvent = vi.fn();

  beforeEach(() => {
    values.clear();
    dispatchEvent.mockClear();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  it('persists conflict state and notifies the visible banner', () => {
    markCloudSyncConflict();

    expect(values.get(CLOUD_SYNC_CONFLICT_STORAGE_KEY)).toBe('1');
    expect(hasCloudSyncConflict()).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: CLOUD_SYNC_CONFLICT_EVENT }),
    );
  });

  it('clears conflict state after manual or automatic reconciliation', () => {
    markCloudSyncConflict();
    clearCloudSyncConflict();

    expect(hasCloudSyncConflict()).toBe(false);
    expect(values.has(CLOUD_SYNC_CONFLICT_STORAGE_KEY)).toBe(false);
  });
});
