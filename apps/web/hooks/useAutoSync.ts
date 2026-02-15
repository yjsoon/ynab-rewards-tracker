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
import { shouldWarnAboutOutdatedUpload } from '@/lib/cloud-sync/decision-helpers';
import { storage } from '@/lib/storage';

const SYNC_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const LAST_SYNC_KEY = 'ynab-rewards-tracker:lastAutoSync';

function parseExportedSettings(): unknown {
  return JSON.parse(storage.exportSettings());
}

function validateImportedSettings(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.cards) && Array.isArray(obj.rules) && typeof obj.settings === 'object' && obj.settings !== null;
}

function hasPrimaryData(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const obj = payload as Record<string, unknown>;
  const cards = Array.isArray(obj.cards) ? obj.cards : [];
  const rules = Array.isArray(obj.rules) ? obj.rules : [];
  const tagMappings = Array.isArray(obj.tagMappings) ? obj.tagMappings : [];
  const themeGroups = Array.isArray(obj.themeGroups) ? obj.themeGroups : [];
  const hiddenCards = Array.isArray(obj.hiddenCards) ? obj.hiddenCards : [];

  const ynab = obj.ynab && typeof obj.ynab === 'object'
    ? (obj.ynab as Record<string, unknown>)
    : null;
  const trackedAccounts = ynab && Array.isArray(ynab.trackedAccountIds) ? ynab.trackedAccountIds : [];

  return (
    cards.length > 0 ||
    rules.length > 0 ||
    tagMappings.length > 0 ||
    themeGroups.length > 0 ||
    hiddenCards.length > 0 ||
    trackedAccounts.length > 0
  );
}

function toStableObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableObject);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    const normalisedEntries = entries.map(([key, entryValue]) => [key, toStableObject(entryValue)] as const);
    return Object.fromEntries(normalisedEntries);
  }

  return value;
}

function createComparableSnapshot(payload: unknown): string {
  const cloned = payload && typeof payload === 'object'
    ? JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
    : payload;

  if (!cloned || typeof cloned !== 'object') {
    return JSON.stringify(cloned);
  }

  const root = cloned as Record<string, unknown>;

  // Ignore volatile/transient fields when deciding whether data diverged.
  delete root.cachedData;
  delete root.calculations;

  if (root.settings && typeof root.settings === 'object') {
    const settings = root.settings as Record<string, unknown>;
    delete settings.cloudSyncLastSyncedAt;
    delete settings.cloudSyncKeyId;
    delete settings.cloudSyncMnemonic;
    delete settings.rememberCloudSyncCode;
  }

  if (root.ynab && typeof root.ynab === 'object') {
    const ynab = root.ynab as Record<string, unknown>;
    delete ynab.pat;
    delete ynab.lastSync;
  }

  return JSON.stringify(toStableObject(root));
}

/**
 * Hook for auto-syncing settings with cloud.
 * Runs on initial load and when the tab regains focus/visibility, with cooldown.
 * Reconciles both directions:
 * - cloud newer -> cloud replaces local
 * - otherwise, if local differs -> local uploads to cloud
 */
export function useAutoSync() {
  const { settings, updateSettings, importSettings } = useSettings();
  const inFlightRef = useRef<Promise<void> | null>(null);

  const autoSync = useCallback(async () => {
    const rememberedMnemonic = settings.cloudSyncMnemonic;
    const isEnabled =
      isAutoSyncEnabled(settings) &&
      settings.rememberCloudSyncCode &&
      rememberedMnemonic;

    if (!isEnabled || !rememberedMnemonic) {
      return;
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    // Check cooldown
    const lastSyncTime = typeof window === 'undefined' ? null : localStorage.getItem(LAST_SYNC_KEY);
    const now = Date.now();
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
        const localPayload = parseExportedSettings();
        const stored = await fetchEncryptedSettings(keyId);

        if (!stored) {
          if (!hasPrimaryData(localPayload)) {
            localStorage.setItem(LAST_SYNC_KEY, now.toString());
            console.log('Auto-sync: No cloud backup yet and local data is empty');
            return;
          }

          const { ciphertext, iv } = await encryptJson(normalised, localPayload);
          const { updatedAt } = await uploadEncryptedSettings({ keyId, ciphertext, iv });
          updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: updatedAt });
          localStorage.setItem(LAST_SYNC_KEY, now.toString());
          console.log('Auto-sync: Seeded cloud backup from local settings');
          return;
        }

        const decrypted = await decryptJson<unknown>(normalised, stored.ciphertext, stored.iv);
        if (!validateImportedSettings(decrypted)) {
          throw new Error('Invalid settings data');
        }

        const shouldUseCloud = shouldWarnAboutOutdatedUpload({
          cloudUpdatedAt: stored.updatedAt,
          localLastSyncedAt: settings.cloudSyncLastSyncedAt,
          localKeyId: settings.cloudSyncKeyId,
          phraseKeyId: keyId,
        });

        if (shouldUseCloud) {
          importSettings(JSON.stringify(decrypted, null, 2));
          updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: stored.updatedAt });
          localStorage.setItem(LAST_SYNC_KEY, now.toString());
          console.log('Auto-sync: Pulled newer cloud settings');
          return;
        }

        const localSnapshot = createComparableSnapshot(localPayload);
        const cloudSnapshot = createComparableSnapshot(decrypted);
        if (localSnapshot !== cloudSnapshot) {
          const { ciphertext, iv } = await encryptJson(normalised, localPayload);
          const { updatedAt } = await uploadEncryptedSettings({ keyId, ciphertext, iv });
          updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: updatedAt });
          localStorage.setItem(LAST_SYNC_KEY, now.toString());
          console.log('Auto-sync: Pushed newer local settings to cloud');
          return;
        }

        updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: stored.updatedAt });
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
  }, [settings, importSettings, updateSettings]);

  useEffect(() => {
    void autoSync();
  }, [autoSync]);

  useEffect(() => {
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
