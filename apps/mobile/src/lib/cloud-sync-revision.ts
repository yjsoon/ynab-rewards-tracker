import type { AppSettings } from '@ynab-counter/app-core/storage';

export function expectedCloudSyncRevision(
  settingsSnapshot: AppSettings,
  phraseKeyId: string,
): string | null {
  return settingsSnapshot.cloudSyncKeyId === phraseKeyId
    ? settingsSnapshot.cloudSyncLastSyncedAt ?? null
    : null;
}

export type ManualCloudSyncSavePlan = {
  needsOverwriteConfirmation: boolean;
  expectedUpdatedAt: string | null;
};

/**
 * Plans a manual save against a revision fetched immediately beforehand.
 * A changed (or removed) backup requires confirmation, and the confirmed
 * write uses that fetched revision so the server can still reject a later race.
 */
export function planManualCloudSyncSave(
  localExpectedUpdatedAt: string | null,
  currentCloudUpdatedAt: string | null,
): ManualCloudSyncSavePlan {
  return {
    needsOverwriteConfirmation: localExpectedUpdatedAt !== currentCloudUpdatedAt,
    expectedUpdatedAt: currentCloudUpdatedAt,
  };
}

export function hasDivergentCloudLineage(
  settingsSnapshot: AppSettings,
  phraseKeyId: string,
  cloudUpdatedAt: string,
  payloadsDiffer: boolean,
): boolean {
  if (!payloadsDiffer || settingsSnapshot.cloudSyncKeyId !== phraseKeyId) return false;

  const localRevision = settingsSnapshot.cloudSyncLastSyncedAt
    ? Date.parse(settingsSnapshot.cloudSyncLastSyncedAt)
    : Number.NaN;
  const cloudRevision = Date.parse(cloudUpdatedAt);

  return Number.isFinite(localRevision)
    && Number.isFinite(cloudRevision)
    && cloudRevision < localRevision;
}
