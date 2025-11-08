import { useCallback, useRef } from 'react';
import { useSettings } from './useLocalStorage';
import {
  normaliseMnemonic,
  isValidMnemonic,
  encryptJson,
  computeKeyId,
  uploadEncryptedSettings,
} from '@/lib/cloud-sync';
import { storage } from '@/lib/storage';

/**
 * Hook for auto-backup to cloud after save actions.
 * Returns a debounced function that silently uploads settings to cloud if sync is enabled.
 */
export function useAutoBackup() {
  const { settings, updateSettings } = useSettings();
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const autoBackup = useCallback(async () => {
    // Only auto-backup if sync is enabled
    const isEnabled = settings.rememberCloudSyncCode && settings.cloudSyncMnemonic;
    if (!isEnabled || !settings.cloudSyncMnemonic) {
      return;
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce: wait 2 seconds after last save
    return new Promise<void>((resolve) => {
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const normalised = normaliseMnemonic(settings.cloudSyncMnemonic!);
          if (!isValidMnemonic(normalised)) {
            console.error('Auto-backup: Invalid stored mnemonic');
            resolve();
            return;
          }

          // Export current settings
          const exportedSettings = storage.exportSettings();
          const payload = JSON.parse(exportedSettings);

          const keyId = await computeKeyId(normalised);
          const { ciphertext, iv } = await encryptJson(normalised, payload);
          const { updatedAt } = await uploadEncryptedSettings({ keyId, ciphertext, iv });

          // Update last synced timestamp
          updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: updatedAt });

          console.log('Auto-backup: Settings backed up to cloud');
          resolve();
        } catch (error) {
          // Silent failure - don't interrupt user experience
          console.error('Auto-backup failed:', error);
          resolve();
          throw error; // Re-throw so caller can show toast
        }
      }, 2000); // 2 second debounce
    });
  }, [settings, updateSettings]);

  return { autoBackup };
}
