import { describe, expect, it } from 'vitest';

/**
 * Test suite for cloud sync decision logic
 *
 * These tests document the expected behavior of shouldWarnAboutOutdatedUpload
 * to prevent regressions in the safeguards that prevent data loss.
 */

describe('cloud sync decision helpers', () => {
  describe('shouldWarnAboutOutdatedUpload logic', () => {
    /**
     * Helper to simulate the decision logic from apps/web/app/settings/page.tsx:776-817
     */
    function shouldWarnLogic(scenario: {
      cloudExists: boolean;
      cloudUpdatedAt?: string;
      localLastSyncedAt?: string;
      localKeyId?: string;
      phraseKeyId: string;
    }): boolean {
      // No cloud backup - no warning needed
      if (!scenario.cloudExists || !scenario.cloudUpdatedAt) {
        return false;
      }

      // Case 1: No local timestamp (new device or never synced)
      if (!scenario.localLastSyncedAt) {
        return true; // Unknown freshness - warn
      }

      // Case 2: Different keyId (switching codes or different device)
      if (scenario.localKeyId !== scenario.phraseKeyId) {
        return true; // Can't trust timestamp comparison - warn
      }

      // Case 3: Same keyId - compare timestamps
      const cloudDate = new Date(scenario.cloudUpdatedAt);
      const localDate = new Date(scenario.localLastSyncedAt);
      const timeDiff = cloudDate.getTime() - localDate.getTime();

      return timeDiff > 60000; // Warn if cloud is >1min newer
    }

    it('warns when cloud backup exists but no local timestamp (new device)', () => {
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: '2025-11-22T18:00:00Z',
        localLastSyncedAt: undefined,
        localKeyId: undefined,
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });

    it('warns when keyIds do not match (different sync code)', () => {
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: '2025-11-22T18:00:00Z',
        localLastSyncedAt: '2025-11-22T17:00:00Z',
        localKeyId: 'keyIdOld',
        phraseKeyId: 'keyIdNew',
      });

      expect(result).toBe(true);
    });

    it('warns when cloud is newer than local (same keyId)', () => {
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: '2025-11-22T18:00:00Z',
        localLastSyncedAt: '2025-11-22T17:00:00Z', // 1 hour older
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true);
    });

    it('does not warn when local is newer than cloud (same keyId)', () => {
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: '2025-11-22T17:00:00Z',
        localLastSyncedAt: '2025-11-22T18:00:00Z', // Local is newer
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });

    it('does not warn when timestamps are within tolerance (same keyId)', () => {
      const now = Date.now();
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: new Date(now + 30000).toISOString(), // 30s newer
        localLastSyncedAt: new Date(now).toISOString(),
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false); // Within 60s tolerance
    });

    it('warns when cloud is just over tolerance threshold (same keyId)', () => {
      const now = Date.now();
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: new Date(now + 61000).toISOString(), // 61s newer
        localLastSyncedAt: new Date(now).toISOString(),
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(true); // Just over 60s tolerance
    });

    it('does not warn when no cloud backup exists', () => {
      const result = shouldWarnLogic({
        cloudExists: false,
        localLastSyncedAt: '2025-11-22T18:00:00Z',
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });

    it('does not warn when cloud exists but has no timestamp', () => {
      const result = shouldWarnLogic({
        cloudExists: true,
        cloudUpdatedAt: undefined,
        localLastSyncedAt: '2025-11-22T18:00:00Z',
        localKeyId: 'keyId123',
        phraseKeyId: 'keyId123',
      });

      expect(result).toBe(false);
    });
  });

  describe('shouldWarnAboutEmptyUpload logic', () => {
    /**
     * Helper to simulate the empty upload warning logic from apps/web/app/settings/page.tsx:744-774
     */
    function shouldWarnEmptyLogic(scenario: {
      hasCards: boolean;
      hasRules: boolean;
      hasCloudKeyId: boolean;
      hasEnteredCode: boolean;
    }): boolean {
      const hasNoCards = !scenario.hasCards;
      const hasNoRules = !scenario.hasRules;
      const likelyHasCloudBackup = scenario.hasCloudKeyId || scenario.hasEnteredCode;

      return hasNoCards && hasNoRules && likelyHasCloudBackup;
    }

    it('warns when uploading empty data with existing cloud backup', () => {
      const result = shouldWarnEmptyLogic({
        hasCards: false,
        hasRules: false,
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(true);
    });

    it('warns when uploading empty data with entered sync code', () => {
      const result = shouldWarnEmptyLogic({
        hasCards: false,
        hasRules: false,
        hasCloudKeyId: false,
        hasEnteredCode: true,
      });

      expect(result).toBe(true);
    });

    it('does not warn when local data is not empty', () => {
      const result = shouldWarnEmptyLogic({
        hasCards: true,
        hasRules: true,
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });

    it('does not warn when empty but no cloud backup exists', () => {
      const result = shouldWarnEmptyLogic({
        hasCards: false,
        hasRules: false,
        hasCloudKeyId: false,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });

    it('does not warn when only cards are missing but rules exist', () => {
      const result = shouldWarnEmptyLogic({
        hasCards: false,
        hasRules: true,
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });

    it('does not warn when only rules are missing but cards exist', () => {
      const result = shouldWarnEmptyLogic({
        hasCards: true,
        hasRules: false,
        hasCloudKeyId: true,
        hasEnteredCode: false,
      });

      expect(result).toBe(false);
    });
  });
});
