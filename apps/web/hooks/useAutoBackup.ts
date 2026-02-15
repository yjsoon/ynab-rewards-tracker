import { useCallback, useRef } from 'react';
import { useSettings } from './useLocalStorage';
import {
  normaliseMnemonic,
  isValidMnemonic,
  encryptJson,
  computeKeyId,
  uploadEncryptedSettings,
  isAutoSyncEnabled,
} from '@/lib/cloud-sync';
import { storage } from '@/lib/storage';

/**
 * Hook for background cloud upload after save actions.
 * Returns a debounced function that silently uploads settings when auto-sync is enabled.
 */
export function useAutoBackup() {
  const { settings, updateSettings } = useSettings();
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const autoBackup = useCallback(async () => {
    // Automatic upload requires both auto-sync preference and a remembered sync code.
    const isEnabled =
      isAutoSyncEnabled(settings) &&
      settings.rememberCloudSyncCode &&
      settings.cloudSyncMnemonic;

    if (!isEnabled || !settings.cloudSyncMnemonic) {
      return;
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce: wait 2 seconds after last save
    return new Promise<void>((resolve, reject) => {
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const normalised = normaliseMnemonic(settings.cloudSyncMnemonic!);
          if (!isValidMnemonic(normalised)) {
            const error = new Error('Invalid stored mnemonic');
            console.error('Auto-sync upload:', error);
            reject(error);
            return;
          }

          // Export current settings
          const exportedSettings = storage.exportSettings();
          const payload = JSON.parse(exportedSettings);

          const keyId = await computeKeyId(normalised);
          const { ciphertext, iv } = await encryptJson(normalised, payload);
          const { updatedAt } = await uploadEncryptedSettings({ keyId, ciphertext, iv });

          // Keep metadata aligned to avoid false local-vs-cloud drift checks.
          updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: updatedAt });

          console.log('Auto-sync: Uploaded latest local settings to cloud');
          resolve();
        } catch (error) {
          // Reject so caller can show error toast
          console.error('Auto-sync upload failed:', error);
          reject(error);
        }
      }, 2000); // 2 second debounce
    });
  }, [settings, updateSettings]);

  return { autoBackup };
}
