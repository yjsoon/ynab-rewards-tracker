import type { AppSettings } from '@/lib/storage';

/**
 * Auto-sync is the explicit preference. For backwards compatibility, if it has
 * never been set we fall back to the legacy remembered-code behaviour.
 */
export function isAutoSyncEnabled(settings: Pick<AppSettings, 'autoSyncEnabled' | 'rememberCloudSyncCode'>): boolean {
  if (typeof settings.autoSyncEnabled === 'boolean') {
    return settings.autoSyncEnabled;
  }

  return Boolean(settings.rememberCloudSyncCode);
}
