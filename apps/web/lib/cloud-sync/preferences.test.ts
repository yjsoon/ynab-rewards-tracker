import { describe, expect, it } from 'vitest';
import { isAutoSyncEnabled } from './preferences';

describe('isAutoSyncEnabled', () => {
  it('uses explicit auto sync preference when set to true', () => {
    expect(isAutoSyncEnabled({ autoSyncEnabled: true, rememberCloudSyncCode: false })).toBe(true);
  });

  it('uses explicit auto sync preference when set to false', () => {
    expect(isAutoSyncEnabled({ autoSyncEnabled: false, rememberCloudSyncCode: true })).toBe(false);
  });

  it('falls back to rememberCloudSyncCode for backwards compatibility', () => {
    expect(isAutoSyncEnabled({ rememberCloudSyncCode: true })).toBe(true);
    expect(isAutoSyncEnabled({ rememberCloudSyncCode: false })).toBe(false);
  });
});
