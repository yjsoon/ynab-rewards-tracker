import { useEffect, useCallback, useRef } from 'react';
import { useSettings } from './useLocalStorage';
import {
  normaliseMnemonic,
  isValidMnemonic,
  decryptJson,
  computeKeyId,
  fetchEncryptedSettings,
} from '@/lib/cloud-sync';
import { storage } from '@/lib/storage';

const SYNC_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const LAST_SYNC_KEY = 'ynab-rewards-tracker:lastAutoSync';

/**
 * Hook for auto-syncing settings from cloud on app load.
 * Only syncs once per half-hour to avoid excessive API calls.
 */
export function useAutoSync() {
  const { settings, updateSettings, importSettings } = useSettings();
  const hasAttemptedRef = useRef(false);

  const autoSync = useCallback(async () => {
    const isEnabled = settings.rememberCloudSyncCode && settings.cloudSyncMnemonic;
    if (!isEnabled || !settings.cloudSyncMnemonic) {
      return;
    }

    // Check cooldown
    const lastSyncTime = localStorage.getItem(LAST_SYNC_KEY);
    const now = Date.now();
    if (lastSyncTime && now - parseInt(lastSyncTime, 10) < SYNC_COOLDOWN) {
      console.log('Auto-sync: Skipped (within cooldown period)');
      return;
    }

    try {
      const normalised = normaliseMnemonic(settings.cloudSyncMnemonic);
      if (!isValidMnemonic(normalised)) {
        console.error('Auto-sync: Invalid stored mnemonic');
        return;
      }

      const keyId = await computeKeyId(normalised);
      const stored = await fetchEncryptedSettings(keyId);

      if (!stored) {
        console.log('Auto-sync: No cloud backup found yet');
        return;
      }

      const decrypted = await decryptJson<unknown>(normalised, stored.ciphertext, stored.iv);

      // Validate before importing
      const obj = decrypted as Record<string, unknown>;
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.cards) || !Array.isArray(obj.rules)) {
        throw new Error('Invalid settings data');
      }

      // Apply settings silently
      const exportedSettings = storage.exportSettings();
      importSettings(JSON.stringify(decrypted, null, 2));
      updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: stored.updatedAt });

      // Update cooldown
      localStorage.setItem(LAST_SYNC_KEY, now.toString());

      console.log('Auto-sync: Settings synced from cloud');
    } catch (error) {
      console.error('Auto-sync failed:', error);
    }
  }, [settings, importSettings, updateSettings]);

  // Run auto-sync once on mount
  useEffect(() => {
    if (!hasAttemptedRef.current) {
      hasAttemptedRef.current = true;
      autoSync();
    }
  }, [autoSync]);
}
