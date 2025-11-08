import { useCallback } from 'react';
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
 * Returns a function that silently uploads settings to cloud if sync is enabled.
 */
export function useAutoBackup() {
  const { settings, updateSettings } = useSettings();

  const autoBackup = useCallback(async () => {
    // Only auto-backup if sync is enabled
    const isEnabled = settings.rememberCloudSyncCode && settings.cloudSyncMnemonic;
    if (!isEnabled || !settings.cloudSyncMnemonic) {
      return;
    }

    try {
      const normalised = normaliseMnemonic(settings.cloudSyncMnemonic);
      if (!isValidMnemonic(normalised)) {
        console.error('Auto-backup: Invalid stored mnemonic');
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
    } catch (error) {
      // Silent failure - don't interrupt user experience
      console.error('Auto-backup failed:', error);
    }
  }, [settings.rememberCloudSyncCode, settings.cloudSyncMnemonic, updateSettings]);

  return { autoBackup };
}
