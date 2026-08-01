import { describe, expect, it, vi } from 'vitest';
import {
  fetchCurrentCloudRevision,
  resolveUploadExpectedRevision,
  shouldWarnAboutEmptyUpload,
  shouldWarnAboutOutdatedUpload,
} from './decision-helpers';

/**
 * Test suite for cloud sync decision logic
 *
 * These tests verify the actual production code to prevent regressions
 * in the safeguards that prevent data loss.
 */

describe('cloud sync decision helpers', () => {
  describe('fetchCurrentCloudRevision', () => {
    it('uses the exact revision fetched immediately before confirmation upload', async () => {
      const fetchBackup = vi.fn().mockResolvedValue({ updatedAt: 'current-cloud-revision' });

      await expect(fetchCurrentCloudRevision('key-1', fetchBackup))
        .resolves.toBe('current-cloud-revision');
      expect(fetchBackup).toHaveBeenCalledOnce();
      expect(fetchBackup).toHaveBeenCalledWith('key-1');
    });

    it('returns a null CAS base when the confirmed key has no backup', async () => {
      await expect(fetchCurrentCloudRevision('key-1', async () => null))
        .resolves.toBeNull();
    });
  });

  describe('resolveUploadExpectedRevision', () => {
    it('uses the freshly confirmed cloud revision for an intentional overwrite', () => {
      expect(resolveUploadExpectedRevision({
        localKeyId: 'key-1',
        localLastSyncedAt: 'old-revision',
        phraseKeyId: 'key-1',
        confirmedCloudUpdatedAt: 'confirmed-revision',
      })).toBe('confirmed-revision');
    });

    it('keeps an explicitly confirmed missing backup as a null CAS revision', () => {
      expect(resolveUploadExpectedRevision({
        localKeyId: 'key-1',
        localLastSyncedAt: 'stale-local-revision',
        phraseKeyId: 'key-1',
        confirmedCloudUpdatedAt: null,
      })).toBeNull();
    });

    it('uses the local base revision when no overwrite was confirmed', () => {
      expect(resolveUploadExpectedRevision({
        localKeyId: 'key-1',
        localLastSyncedAt: 'base-revision',
        phraseKeyId: 'key-1',
      })).toBe('base-revision');
      expect(resolveUploadExpectedRevision({
        localKeyId: 'another-key',
        localLastSyncedAt: 'base-revision',
        phraseKeyId: 'key-1',
      })).toBeNull();
    });
  });

  describe('shouldWarnAboutOutdatedUpload', () => {

    it('warns when cloud backup exists but no local timestamp (new device)', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: '2025-11-22T18:00:00Z',
        localLastSyncedAt: undefined,
        localKeyId: undefined,
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });

    it('warns when keyIds do not match (different sync code)', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: '2025-11-22T18:00:00Z',
        localLastSyncedAt: '2025-11-22T17:00:00Z',
        localKeyId: 'keyIdOld',
        phraseKeyId: 'keyIdNew',
      });

      expect(result).toBe(true);
    });

    it('warns when cloud is newer than local (same keyId)', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: '2025-11-22T18:00:00Z',
        localLastSyncedAt: '2025-11-22T17:00:00Z', // 1 hour older
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });

    it('warns when local and cloud revisions differ even if local looks newer', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: '2025-11-22T17:00:00Z',
        localLastSyncedAt: '2025-11-22T18:00:00Z', // Local is newer
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });

    it('warns when revisions differ by only a few milliseconds', () => {
      const now = Date.now();
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: new Date(now + 1).toISOString(),
        localLastSyncedAt: new Date(now).toISOString(),
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });

    it('does not warn when cloud and local revisions match exactly', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: 'opaque-revision-token',
        localLastSyncedAt: 'opaque-revision-token',
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });

    it('does not warn when no cloud backup exists', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: undefined,
        localLastSyncedAt: '2025-11-22T18:00:00Z',
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });

    it('does not warn when cloud exists but has no timestamp', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: undefined,
        localLastSyncedAt: '2025-11-22T18:00:00Z',
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });

    it('warns when opaque revisions are unequal', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: 'not-a-date',
        localLastSyncedAt: '2025-11-22T18:00:00Z',
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });
  });

  describe('shouldWarnAboutEmptyUpload', () => {
    it('warns when uploading empty data with existing cloud backup', () => {
      const result = shouldWarnAboutEmptyUpload({
        cards: [],
        rules: [],
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(true);
    });

    it('warns when uploading empty data with entered sync code', () => {
      const result = shouldWarnAboutEmptyUpload({
        cards: [],
        rules: [],
        hasCloudKeyId: false,
        hasEnteredCode: true,
      });

      expect(result).toBe(true);
    });

    it('does not warn when local data is not empty', () => {
      const result = shouldWarnAboutEmptyUpload({
        cards: [{ id: '1' }],
        rules: [{ id: '1' }],
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });

    it('does not warn when empty but no cloud backup exists', () => {
      const result = shouldWarnAboutEmptyUpload({
        cards: [],
        rules: [],
        hasCloudKeyId: false,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });

    it('does not warn when only cards are missing but rules exist', () => {
      const result = shouldWarnAboutEmptyUpload({
        cards: [],
        rules: [{ id: '1' }],
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });

    it('does not warn when only rules are missing but cards exist', () => {
      const result = shouldWarnAboutEmptyUpload({
        cards: [{ id: '1' }],
        rules: [],
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });
  });
});
