/**
 * Cloud sync decision helpers
 *
 * These pure functions determine when to warn users about potentially destructive
 * upload operations to prevent accidental data loss.
 */

export interface EmptyUploadCheckParams {
  cards: unknown[];
  rules: unknown[];
  hasCloudKeyId: boolean;
  hasEnteredCode: boolean;
}

export interface OutdatedUploadCheckParams {
  cloudUpdatedAt: string | undefined;
  localLastSyncedAt: string | undefined;
  localKeyId: string | undefined;
  phraseKeyId: string;
}

/**
 * Determines if uploading empty settings would overwrite an existing cloud backup.
 *
 * Warns when:
 * - Local has no cards AND no rules (empty)
 * - AND cloud backup likely exists (has keyId or user entered a code)
 *
 * This prevents accidentally wiping out a cloud backup with empty local data.
 */
export function shouldWarnAboutEmptyUpload(params: EmptyUploadCheckParams): boolean {
  const hasNoCards = !Array.isArray(params.cards) || params.cards.length === 0;
  const hasNoRules = !Array.isArray(params.rules) || params.rules.length === 0;
  const likelyHasCloudBackup = params.hasCloudKeyId || params.hasEnteredCode;

  return hasNoCards && hasNoRules && likelyHasCloudBackup;
}

/**
 * Determines if uploading would overwrite potentially newer cloud data.
 *
 * Warns when:
 * 1. Cloud has data but no local timestamp (new device - unknown freshness)
 * 2. KeyIds don't match (different sync code - can't trust timestamp comparison)
 * 3. Cloud timestamp is >60s newer than local (cloud has newer data)
 *
 * This prevents accidentally overwriting newer cloud backups with older local data.
 */
export function shouldWarnAboutOutdatedUpload(params: OutdatedUploadCheckParams): boolean {
  // No cloud backup - no warning needed
  if (!params.cloudUpdatedAt) {
    return false;
  }

  // Case 1: No local timestamp (new device or never synced with this code)
  // Cloud has data but we don't know if local is fresh - warn to prevent overwrite
  if (!params.localLastSyncedAt) {
    return true; // Unknown freshness - always warn
  }

  // Case 2: Local timestamp exists, but verify it's for the same keyId
  // If keyIds don't match, we can't trust the timestamp comparison
  if (params.localKeyId !== params.phraseKeyId) {
    return true; // Different code - warn to prevent overwrite
  }

  // Case 3: Same keyId - compare timestamps
  const cloudDate = new Date(params.cloudUpdatedAt);
  const localDate = new Date(params.localLastSyncedAt);

  // Warn if cloud is newer than local (with 1-minute tolerance for clock skew)
  const timeDiff = cloudDate.getTime() - localDate.getTime();
  return timeDiff > 60000; // 60 seconds tolerance
}
