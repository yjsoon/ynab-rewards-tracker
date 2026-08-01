import type { AppSettings } from '@ynab-counter/app-core/storage';

export function expectedCloudSyncRevision(
  settingsSnapshot: AppSettings,
  phraseKeyId: string,
): string | null {
  return settingsSnapshot.cloudSyncKeyId === phraseKeyId
    ? settingsSnapshot.cloudSyncLastSyncedAt ?? null
    : null;
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
