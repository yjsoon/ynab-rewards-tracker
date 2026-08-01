import { describe, expect, it } from 'vitest';
import {
  createComparableSnapshot,
  determineAutoSyncAction,
  isLocalSnapshotCurrent,
  validateImportedSettings,
} from './auto-sync-helpers';

const basePayload = {
  ynab: { selectedBudgetId: 'budget-1', trackedAccountIds: ['acct-1'] },
  cards: [{ id: 'card-1' }],
  rules: [],
  tagMappings: [],
  calculations: [],
  themeGroups: [],
  hiddenCards: [],
  settings: {},
};

describe('auto-sync helpers', () => {
  it('validates imported settings with expected top-level shape', () => {
    expect(validateImportedSettings(basePayload)).toBe(true);
    expect(validateImportedSettings({ ...basePayload, cards: 'nope' })).toBe(false);
    expect(validateImportedSettings({ ...basePayload, settings: [] })).toBe(false);
    expect(validateImportedSettings({
      ...basePayload,
      settings: { autoSyncEnabled: 'yes' },
    })).toBe(false);
  });

  it('returns skip when cloud is missing and local primary data is empty', () => {
    const action = determineAutoSyncAction({
      localPayload: {
        ...basePayload,
        cards: [],
        ynab: { trackedAccountIds: [] },
      },
      cloudPayload: null,
      cloudUpdatedAt: undefined,
      localLastSyncedAt: undefined,
      localKeyId: undefined,
      phraseKeyId: 'key-1',
      localIsDirty: false,
    });

    expect(action).toBe('skip');
  });

  it('returns seed_cloud when cloud is missing and local has primary data', () => {
    const action = determineAutoSyncAction({
      localPayload: basePayload,
      cloudPayload: null,
      cloudUpdatedAt: undefined,
      localLastSyncedAt: undefined,
      localKeyId: undefined,
      phraseKeyId: 'key-1',
      localIsDirty: true,
    });

    expect(action).toBe('seed_cloud');
  });

  it('seeds a missing cloud backup from an intentionally emptied local snapshot', () => {
    const action = determineAutoSyncAction({
      localPayload: {
        ...basePayload,
        cards: [],
        ynab: { trackedAccountIds: [] },
      },
      cloudPayload: null,
      cloudUpdatedAt: undefined,
      localLastSyncedAt: '2026-01-01T12:00:00Z',
      localKeyId: 'key-1',
      phraseKeyId: 'key-1',
      localIsDirty: true,
    });

    expect(action).toBe('seed_cloud');
  });

  it('returns pull_cloud when cloud is newer/unknown freshness', () => {
    const action = determineAutoSyncAction({
      localPayload: basePayload,
      cloudPayload: { ...basePayload, cards: [{ id: 'cloud-card' }] },
      cloudUpdatedAt: '2026-01-01T12:00:00Z',
      localLastSyncedAt: undefined,
      localKeyId: undefined,
      phraseKeyId: 'key-1',
      localIsDirty: false,
    });

    expect(action).toBe('pull_cloud');
  });

  it('returns push_local when local differs and cloud is not newer', () => {
    const action = determineAutoSyncAction({
      localPayload: { ...basePayload, cards: [{ id: 'card-1' }, { id: 'card-2' }] },
      cloudPayload: basePayload,
      cloudUpdatedAt: '2026-01-01T12:00:00Z',
      localLastSyncedAt: '2026-01-01T12:00:00Z',
      localKeyId: 'key-1',
      phraseKeyId: 'key-1',
      localIsDirty: true,
    });

    expect(action).toBe('push_local');
  });

  it('returns in_sync when snapshots match after local-only field filtering', () => {
    const localPayload = {
      ...basePayload,
      settings: {
        autoSyncEnabled: true,
        cloudSyncMnemonic: 'one two three',
        rememberCloudSyncCode: true,
      },
    };
    const cloudPayload = {
      ...basePayload,
      settings: {
        autoSyncEnabled: false,
      },
    };

    const localSnapshot = createComparableSnapshot(localPayload);
    const cloudSnapshot = createComparableSnapshot(cloudPayload);
    expect(localSnapshot).toBe(cloudSnapshot);

    const action = determineAutoSyncAction({
      localPayload,
      cloudPayload,
      cloudUpdatedAt: '2026-01-01T12:00:00Z',
      localLastSyncedAt: '2026-01-01T12:00:00Z',
      localKeyId: 'key-1',
      phraseKeyId: 'key-1',
      localIsDirty: false,
    });
    expect(action).toBe('in_sync');
  });

  it('keeps an intentional null distinct from an absent legacy field', () => {
    const localPayload = {
      ...basePayload,
      cards: [{ id: 'card-1', earningRate: null }],
    };

    expect(createComparableSnapshot(localPayload)).not.toBe(
      createComparableSnapshot(basePayload),
    );
    expect(determineAutoSyncAction({
      localPayload,
      cloudPayload: basePayload,
      cloudUpdatedAt: '2026-01-01T12:00:00Z',
      localLastSyncedAt: '2026-01-01T12:00:00Z',
      localKeyId: 'key-1',
      phraseKeyId: 'key-1',
      localIsDirty: true,
    })).toBe('push_local');
  });

  it('returns conflict when both local and cloud changed from the shared revision', () => {
    const action = determineAutoSyncAction({
      localPayload: { ...basePayload, cards: [{ id: 'local-card' }] },
      cloudPayload: { ...basePayload, cards: [{ id: 'cloud-card' }] },
      cloudUpdatedAt: '2026-01-01T12:00:30Z',
      localLastSyncedAt: '2026-01-01T12:00:00Z',
      localKeyId: 'key-1',
      phraseKeyId: 'key-1',
      localIsDirty: true,
    });

    expect(action).toBe('conflict');
  });

  it('pulls an exact newer server revision when local remains clean', () => {
    const action = determineAutoSyncAction({
      localPayload: basePayload,
      cloudPayload: { ...basePayload, cards: [{ id: 'cloud-card' }] },
      cloudUpdatedAt: '2026-01-01T12:00:30Z',
      localLastSyncedAt: '2026-01-01T12:00:00Z',
      localKeyId: 'key-1',
      phraseKeyId: 'key-1',
      localIsDirty: false,
    });

    expect(action).toBe('pull_cloud');
  });

  it('rejects a pull snapshot after local data or its dirty marker changes', () => {
    expect(isLocalSnapshotCurrent({
      expectedPayload: basePayload,
      expectedDirtyMarker: undefined,
      currentPayload: basePayload,
      currentDirtyMarker: undefined,
    })).toBe(true);
    expect(isLocalSnapshotCurrent({
      expectedPayload: basePayload,
      expectedDirtyMarker: undefined,
      currentPayload: { ...basePayload, cards: [{ id: 'edited-card' }] },
      currentDirtyMarker: '2026-01-01T12:00:01Z',
    })).toBe(false);
    expect(isLocalSnapshotCurrent({
      expectedPayload: basePayload,
      expectedDirtyMarker: undefined,
      currentPayload: basePayload,
      currentDirtyMarker: '2026-01-01T12:00:01Z',
    })).toBe(false);
    expect(isLocalSnapshotCurrent({
      expectedPayload: basePayload,
      expectedDirtyMarker: undefined,
      currentPayload: { ...basePayload, cachedData: { refreshedAt: 'later' } },
      currentDirtyMarker: undefined,
    })).toBe(true);
  });
});
