import { useEffect, useCallback, useRef } from 'react';
import { useSettings } from './useLocalStorage';
import {
  normaliseMnemonic,
  isValidMnemonic,
  encryptJson,
  decryptJson,
  computeKeyId,
  fetchEncryptedSettings,
  uploadEncryptedSettings,
  isAutoSyncEnabled,
} from '@/lib/cloud-sync';
import {
  determineAutoSyncAction,
  isLocalSnapshotCurrent,
} from '@/lib/cloud-sync/auto-sync-helpers';
import {
  clearCloudSyncConflict,
  markCloudSyncConflict,
} from '@/lib/cloud-sync/conflict-state';
import { storage } from '@/lib/storage';

const SYNC_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const PARSE_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const LAST_SYNC_KEY = 'ynab-rewards-tracker:lastAutoSync';
const LAST_PARSE_ERROR_KEY = 'ynab-rewards-tracker:lastAutoSyncParseError';

/**
 * Hook for auto-syncing settings with cloud.
 * Runs on initial load and when the tab regains focus/visibility, with cooldown.
 * Reconciles both directions:
 * - cloud newer -> cloud replaces local
 * - otherwise, if local differs -> local uploads to cloud
 */
export function useAutoSync() {
  const {
    settings,
    updateSettings,
    completeCloudSyncSnapshot,
    importSettings,
  } = useSettings();
  const inFlightRef = useRef<Promise<void> | null>(null);

  const autoSync = useCallback(async () => {
    const rememberedMnemonic = settings.cloudSyncMnemonic;
    // Auto-sync only runs when users explicitly store a local sync code on this device.
    const isEnabled = isAutoSyncEnabled(settings) && settings.rememberCloudSyncCode && rememberedMnemonic;

    if (!isEnabled || !rememberedMnemonic) {
      return;
    }

    const now = Date.now();

    const lastParseErrorTime = typeof window === 'undefined' ? null : localStorage.getItem(LAST_PARSE_ERROR_KEY);
    const parsedLastParseErrorTime = lastParseErrorTime ? Number.parseInt(lastParseErrorTime, 10) : Number.NaN;
    if (Number.isFinite(parsedLastParseErrorTime) && now - parsedLastParseErrorTime < PARSE_ERROR_COOLDOWN) {
      console.log('Auto-sync: Skipped due to recent local export parse error');
      return;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    // Check cooldown
    const lastSyncTime = typeof window === 'undefined' ? null : localStorage.getItem(LAST_SYNC_KEY);
    const parsedLastSyncTime = lastSyncTime ? Number.parseInt(lastSyncTime, 10) : Number.NaN;
    if (Number.isFinite(parsedLastSyncTime) && now - parsedLastSyncTime < SYNC_COOLDOWN) {
      console.log('Auto-sync: Skipped (within cooldown period)');
      return;
    }

    const run = (async () => {
      try {
        const normalised = normaliseMnemonic(rememberedMnemonic);
        if (!isValidMnemonic(normalised)) {
          console.error('Auto-sync: Invalid stored mnemonic');
          return;
        }

        const keyId = await computeKeyId(normalised);
        let localPayload: unknown;
        try {
          localPayload = JSON.parse(storage.exportSettings());
          localStorage.removeItem(LAST_PARSE_ERROR_KEY);
        } catch (error) {
          localStorage.setItem(LAST_PARSE_ERROR_KEY, now.toString());
          console.error('Auto-sync: Failed to parse local export payload', error);
          return;
        }
        const snapshotMarker = storage.getSettings().cloudSyncLocalChangedAt;

        const stored = await fetchEncryptedSettings(keyId);

        const decrypted = stored
          ? await decryptJson<unknown>(normalised, stored.ciphertext, stored.iv)
          : null;

        const action = determineAutoSyncAction({
          localPayload,
          cloudPayload: decrypted,
          cloudUpdatedAt: stored?.updatedAt,
          localLastSyncedAt: settings.cloudSyncLastSyncedAt,
          localKeyId: settings.cloudSyncKeyId,
          phraseKeyId: keyId,
          localIsDirty: Boolean(snapshotMarker),
        });

        if (action === 'skip') {
          console.log('Auto-sync: No cloud backup yet and local data is empty');
          return;
        }

        if (action === 'seed_cloud') {
          const { ciphertext, iv } = await encryptJson(normalised, localPayload);
          const { updatedAt } = await uploadEncryptedSettings({
            keyId,
            ciphertext,
            iv,
            expectedUpdatedAt: null,
          });
          completeCloudSyncSnapshot(snapshotMarker, {
            cloudSyncKeyId: keyId,
            cloudSyncLastSyncedAt: updatedAt,
          });
          clearCloudSyncConflict();
          localStorage.setItem(LAST_SYNC_KEY, now.toString());
          console.log('Auto-sync: Seeded cloud backup from local settings');
          return;
        }

        if (action === 'conflict') {
          markCloudSyncConflict();
          console.warn('Auto-sync: Local and cloud settings both changed; manual reconciliation required');
          return;
        }

        if (!stored || !decrypted) {
          throw new Error('Missing cloud payload for sync action');
        }

        if (action === 'pull_cloud') {
          const currentPayload = JSON.parse(storage.exportSettings());
          const currentMarker = storage.getSettings().cloudSyncLocalChangedAt;
          if (!isLocalSnapshotCurrent({
            expectedPayload: localPayload,
            expectedDirtyMarker: snapshotMarker,
            currentPayload,
            currentDirtyMarker: currentMarker,
          })) {
            markCloudSyncConflict();
            console.warn('Auto-sync: Local settings changed while cloud data was loading');
            return;
          }
          importSettings(JSON.stringify(decrypted, null, 2));
          updateSettings({
            cloudSyncKeyId: keyId,
            cloudSyncLastSyncedAt: stored.updatedAt,
            cloudSyncLocalChangedAt: undefined,
          });
          clearCloudSyncConflict();
          localStorage.setItem(LAST_SYNC_KEY, now.toString());
          console.log('Auto-sync: Pulled newer cloud settings');
          return;
        }

        if (action === 'push_local') {
          const { ciphertext, iv } = await encryptJson(normalised, localPayload);
          const { updatedAt } = await uploadEncryptedSettings({
            keyId,
            ciphertext,
            iv,
            expectedUpdatedAt: stored.updatedAt,
          });
          completeCloudSyncSnapshot(snapshotMarker, {
            cloudSyncKeyId: keyId,
            cloudSyncLastSyncedAt: updatedAt,
          });
          clearCloudSyncConflict();
          localStorage.setItem(LAST_SYNC_KEY, now.toString());
          console.log('Auto-sync: Pushed newer local settings to cloud');
          return;
        }

        completeCloudSyncSnapshot(snapshotMarker, {
          cloudSyncKeyId: keyId,
          cloudSyncLastSyncedAt: stored.updatedAt,
        });
        clearCloudSyncConflict();
        localStorage.setItem(LAST_SYNC_KEY, now.toString());
        console.log('Auto-sync: Local and cloud settings are already in sync');
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [completeCloudSyncSnapshot, settings, importSettings, updateSettings]);

  useEffect(() => {
    // Intentionally re-run when settings change; cooldown prevents repeated network churn.
    void autoSync();
  }, [autoSync]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const onFocus = () => {
      void autoSync();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void autoSync();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [autoSync]);
}
