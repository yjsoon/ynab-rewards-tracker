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
  const pendingPromiseRef = useRef<Promise<void> | null>(null);
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const pendingRejectRef = useRef<((reason?: unknown) => void) | null>(null);
  const uploadInFlightRef = useRef(false);

  const settlePending = useCallback((error?: unknown) => {
    const resolve = pendingResolveRef.current;
    const reject = pendingRejectRef.current;

    pendingPromiseRef.current = null;
    pendingResolveRef.current = null;
    pendingRejectRef.current = null;

    if (error) {
      reject?.(error);
      return;
    }

    resolve?.();
  }, []);

  const autoBackup = useCallback(async () => {
    // Automatic upload requires both auto-sync preference and a remembered sync code.
    const isEnabled =
      isAutoSyncEnabled(settings) &&
      settings.rememberCloudSyncCode &&
      settings.cloudSyncMnemonic;

    if (!isEnabled || !settings.cloudSyncMnemonic) {
      return;
    }

    if (uploadInFlightRef.current) {
      return pendingPromiseRef.current ?? Promise.resolve();
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!pendingPromiseRef.current) {
      pendingPromiseRef.current = new Promise<void>((resolve, reject) => {
        pendingResolveRef.current = resolve;
        pendingRejectRef.current = reject;
      });
    }

    // Debounce: wait 2 seconds after last save, then resolve/reject every
    // caller in this debounce window with the same upload result.
    debounceTimerRef.current = setTimeout(async () => {
      uploadInFlightRef.current = true;
      try {
        const normalised = normaliseMnemonic(settings.cloudSyncMnemonic!);
        if (!isValidMnemonic(normalised)) {
          const error = new Error('Invalid stored mnemonic');
          console.error('Auto-sync upload:', error);
          settlePending(error);
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
        settlePending();
      } catch (error) {
        // Reject so caller can show error toast
        console.error('Auto-sync upload failed:', error);
        settlePending(error);
      } finally {
        uploadInFlightRef.current = false;
      }
    }, 2000); // 2 second debounce

    return pendingPromiseRef.current;
  }, [settings, updateSettings, settlePending]);

  return { autoBackup };
}
