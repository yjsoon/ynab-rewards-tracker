import { describe, expect, it } from 'vitest';

import {
  expectedCloudSyncRevision,
  hasDivergentCloudLineage,
  planManualCloudSyncSave,
} from './cloud-sync-revision';

describe('expectedCloudSyncRevision', () => {
  it('uses the revision from the exported snapshot instead of stale UI state', () => {
    const staleUiSettings = {
      cloudSyncKeyId: 'key-1',
      cloudSyncLastSyncedAt: 'old-revision',
    };
    const freshSnapshotSettings = {
      cloudSyncKeyId: 'key-1',
      cloudSyncLastSyncedAt: 'new-revision',
    };

    expect(expectedCloudSyncRevision(freshSnapshotSettings, 'key-1'))
      .toBe('new-revision');
    expect(expectedCloudSyncRevision(freshSnapshotSettings, 'another-key'))
      .toBeNull();
    expect(staleUiSettings.cloudSyncLastSyncedAt).toBe('old-revision');
  });
});

describe('planManualCloudSyncSave', () => {
  it('uses the freshly fetched cloud revision after an overwrite confirmation', () => {
    expect(planManualCloudSyncSave('shared-revision', 'new-cloud-revision')).toEqual({
      needsOverwriteConfirmation: true,
      expectedUpdatedAt: 'new-cloud-revision',
    });
  });

  it('saves immediately when the local and cloud revisions still match', () => {
    expect(planManualCloudSyncSave('shared-revision', 'shared-revision')).toEqual({
      needsOverwriteConfirmation: false,
      expectedUpdatedAt: 'shared-revision',
    });
  });

  it('requires confirmation before recreating a remotely deleted backup', () => {
    expect(planManualCloudSyncSave('shared-revision', null)).toEqual({
      needsOverwriteConfirmation: true,
      expectedUpdatedAt: null,
    });
  });

  it('requires confirmation before replacing a backup new to this iPhone', () => {
    expect(planManualCloudSyncSave(null, 'cloud-revision')).toEqual({
      needsOverwriteConfirmation: true,
      expectedUpdatedAt: 'cloud-revision',
    });
  });
});

describe('hasDivergentCloudLineage', () => {
  it('requires manual reconciliation for divergent data from an older cloud revision', () => {
    const settings = {
      cloudSyncKeyId: 'key-1',
      cloudSyncLastSyncedAt: '2026-01-01T12:00:30Z',
    };

    expect(hasDivergentCloudLineage(
      settings,
      'key-1',
      '2026-01-01T12:00:00Z',
      true,
    )).toBe(true);
    expect(hasDivergentCloudLineage(
      settings,
      'key-1',
      '2026-01-01T12:00:00Z',
      false,
    )).toBe(false);
    expect(hasDivergentCloudLineage(
      settings,
      'key-1',
      '2026-01-01T12:01:00Z',
      true,
    )).toBe(false);
    expect(hasDivergentCloudLineage(
      settings,
      'another-key',
      '2026-01-01T12:00:00Z',
      true,
    )).toBe(false);
  });
});
