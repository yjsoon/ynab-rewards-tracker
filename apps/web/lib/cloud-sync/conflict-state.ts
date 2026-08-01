export const CLOUD_SYNC_CONFLICT_STORAGE_KEY = 'ynab-rewards-tracker:cloudSyncConflict';
export const CLOUD_SYNC_CONFLICT_EVENT = 'ynab-rewards-tracker:cloudSyncConflictChanged';

export function hasCloudSyncConflict(): boolean {
  return typeof window !== 'undefined'
    && localStorage.getItem(CLOUD_SYNC_CONFLICT_STORAGE_KEY) === '1';
}

function notifyConflictChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CLOUD_SYNC_CONFLICT_EVENT));
  }
}

export function markCloudSyncConflict(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLOUD_SYNC_CONFLICT_STORAGE_KEY, '1');
  notifyConflictChanged();
}

export function clearCloudSyncConflict(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CLOUD_SYNC_CONFLICT_STORAGE_KEY);
  notifyConflictChanged();
}
