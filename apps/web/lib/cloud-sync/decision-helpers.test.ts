import { describe, expect, it } from 'vitest';
import {
  shouldWarnAboutEmptyUpload,
  shouldWarnAboutOutdatedUpload,
  type EmptyUploadCheckParams,
  type OutdatedUploadCheckParams,
} from './decision-helpers';

/**
 * Test suite for cloud sync decision logic
 *
 * These tests verify the actual production code to prevent regressions
 * in the safeguards that prevent data loss.
 */

describe('cloud sync decision helpers', () => {
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

    it('does not warn when local is newer than cloud (same keyId)', () => {
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: '2025-11-22T17:00:00Z',
        localLastSyncedAt: '2025-11-22T18:00:00Z', // Local is newer
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });

    it('does not warn when timestamps are within tolerance (same keyId)', () => {
      const now = Date.now();
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: new Date(now + 30000).toISOString(), // 30s newer
        localLastSyncedAt: new Date(now).toISOString(),
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false); // Within 60s tolerance
    });

    it('warns when cloud is just over tolerance threshold (same keyId)', () => {
      const now = Date.now();
      const result = shouldWarnAboutOutdatedUpload({
        cloudUpdatedAt: new Date(now + 61000).toISOString(), // 61s newer
        localLastSyncedAt: new Date(now).toISOString(),
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true); // Just over 60s tolerance
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
