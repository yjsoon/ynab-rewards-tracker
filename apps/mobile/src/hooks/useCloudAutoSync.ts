import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useStorage } from '@/contexts/StorageContext';
import {
  loadRememberedCloudSyncCode,
  restoreSettingsFromCloud,
  saveSettingsToCloud,
} from '@/lib/cloud-sync';
import { storage } from '@/storage/service';
import {
  createCloudSyncPayload,
  parseCloudSyncPayload,
} from '@ynab-counter/app-core/cloud-sync';
import type { StorageData } from '@ynab-counter/app-core/storage';

const FOREGROUND_COOLDOWN_MS = 30 * 60 * 1000;
const CHANGE_DEBOUNCE_MS = 2_000;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function comparable(payload: StorageData): string {
  return JSON.stringify(stableValue(createCloudSyncPayload(payload)));
}

function isMissingBackup(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No cloud backup was found');
}

async function readLocalSnapshot(): Promise<{
  payload: StorageData;
  settings: StorageData['settings'];
}> {
  const raw = JSON.parse(await storage.exportSettings()) as StorageData;
  return { payload: createCloudSyncPayload(raw), settings: raw.settings };
}

/**
 * Reconciles the same encrypted settings payload used by the web app. Cached
 * YNAB data and secrets never enter the comparison or upload.
 */
export function useCloudAutoSync(): void {
  const { state, status, actions } = useStorage();
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastAttemptRef = useRef(0);
  const lastSignatureRef = useRef<string | undefined>(undefined);

  const enabled = Boolean(
    status.isHydrated &&
    state.settings.autoSyncEnabled &&
    state.settings.rememberCloudSyncCode,
  );

  const localSignature = useMemo(
    () => JSON.stringify(stableValue({
      ynab: {
        selectedBudgetId: state.selectedBudget.id,
        selectedBudgetName: state.selectedBudget.name,
        trackedAccountIds: state.trackedAccountIds,
      },
      cards: state.cards,
      rules: state.rules,
      tagMappings: state.tagMappings,
      themeGroups: state.themeGroups,
      hiddenCards: state.hiddenCards,
      settings: {
        theme: state.settings.theme,
        currency: state.settings.currency,
        milesValuation: state.settings.milesValuation,
        dashboardViewMode: state.settings.dashboardViewMode,
        groupCardsByType: state.settings.groupCardsByType,
        cardOrdering: state.settings.cardOrdering,
        collapsedCardGroups: state.settings.collapsedCardGroups,
        summaryViewSubcategoriesExpanded: state.settings.summaryViewSubcategoriesExpanded,
        statementFormatter: state.settings.statementFormatter
          ? { ...state.settings.statementFormatter, apiKeys: undefined }
          : undefined,
      },
    })),
    [
      state.cards,
      state.hiddenCards,
      state.rules,
      state.selectedBudget.id,
      state.selectedBudget.name,
      state.settings.cardOrdering,
      state.settings.collapsedCardGroups,
      state.settings.currency,
      state.settings.dashboardViewMode,
      state.settings.groupCardsByType,
      state.settings.milesValuation,
      state.settings.statementFormatter,
      state.settings.summaryViewSubcategoriesExpanded,
      state.settings.theme,
      state.tagMappings,
      state.themeGroups,
      state.trackedAccountIds,
    ],
  );

  const reconcile = useCallback(async (force = false) => {
    if (!enabled) return;
    const now = Date.now();
    if (!force && now - lastAttemptRef.current < FOREGROUND_COOLDOWN_MS) return;
    if (inFlightRef.current) return inFlightRef.current;

    const run = (async () => {
      lastAttemptRef.current = now;
      const phrase = await loadRememberedCloudSyncCode();
      if (!phrase) return;

      let restored: Awaited<ReturnType<typeof restoreSettingsFromCloud<unknown>>>;
      try {
        restored = await restoreSettingsFromCloud<unknown>(phrase);
      } catch (error) {
        if (!isMissingBackup(error)) throw error;
        const latestLocal = await readLocalSnapshot();
        const seeded = await saveSettingsToCloud(phrase, latestLocal.payload);
        const afterSeed = await storage.getSettings();
        await actions.setSettings({
          cloudSyncKeyId: seeded.keyId,
          cloudSyncLastSyncedAt: seeded.updatedAt,
          cloudSyncLocalChangedAt:
            afterSeed.cloudSyncLocalChangedAt === latestLocal.settings.cloudSyncLocalChangedAt
              ? undefined
              : afterSeed.cloudSyncLocalChangedAt,
        });
        return;
      }

      const cloudPayload = parseCloudSyncPayload(restored.data);
      const latestLocal = await readLocalSnapshot();
      const localPayload = latestLocal.payload;
      const localSettings = latestLocal.settings;
      const lastLocalSync = localSettings.cloudSyncLastSyncedAt
        ? Date.parse(localSettings.cloudSyncLastSyncedAt)
        : Number.NaN;
      const cloudUpdated = Date.parse(restored.updatedAt);
      const sameKey = localSettings.cloudSyncKeyId === restored.keyId;
      const orderKnown = sameKey && Number.isFinite(lastLocalSync) && Number.isFinite(cloudUpdated);
      // A marker exists only between a local payload mutation and a confirmed
      // push/import. Do not compare device and server clocks to decide dirtiness.
      const localIsDirty = Boolean(localSettings.cloudSyncLocalChangedAt);
      const cloudIsNewer = orderKnown && cloudUpdated > lastLocalSync;

      if (cloudIsNewer && localIsDirty) {
        // Both sides changed since the common baseline. Leave reconciliation
        // to the manual restore/save flow rather than silently choosing a winner.
        return;
      }

      if (cloudIsNewer) {
        await storage.importSettings(JSON.stringify(cloudPayload), {
          expectedCloudSyncLocalChangedAt: localSettings.cloudSyncLocalChangedAt ?? null,
        });
        const afterImport = await storage.getSettings();
        await storage.updateSettings({
          cloudSyncKeyId: restored.keyId,
          cloudSyncLastSyncedAt: restored.updatedAt,
          cloudSyncLocalChangedAt:
            afterImport.cloudSyncLocalChangedAt === localSettings.cloudSyncLocalChangedAt
              ? undefined
              : afterImport.cloudSyncLocalChangedAt,
          rememberCloudSyncCode: true,
          autoSyncEnabled: true,
        });
        await actions.refresh();
        return;
      }

      const payloadsDiffer = comparable(localPayload) !== comparable(cloudPayload);
      if (payloadsDiffer && !orderKnown) {
        // Automatic sync cannot safely choose a winner without a shared key and timestamp.
        return;
      }

      if (payloadsDiffer) {
        const pushed = await saveSettingsToCloud(phrase, localPayload);
        const afterPush = await storage.getSettings();
        await actions.setSettings({
          cloudSyncKeyId: pushed.keyId,
          cloudSyncLastSyncedAt: pushed.updatedAt,
          cloudSyncLocalChangedAt:
            afterPush.cloudSyncLocalChangedAt === localSettings.cloudSyncLocalChangedAt
              ? undefined
              : afterPush.cloudSyncLocalChangedAt,
        });
        return;
      }

      if (
        localSettings.cloudSyncKeyId !== restored.keyId ||
        localSettings.cloudSyncLastSyncedAt !== restored.updatedAt ||
        localSettings.cloudSyncLocalChangedAt !== undefined
      ) {
        const latestSettings = await storage.getSettings();
        await actions.setSettings({
          cloudSyncKeyId: restored.keyId,
          cloudSyncLastSyncedAt: restored.updatedAt,
          cloudSyncLocalChangedAt:
            latestSettings.cloudSyncLocalChangedAt === localSettings.cloudSyncLocalChangedAt
              ? undefined
              : latestSettings.cloudSyncLocalChangedAt,
        });
      }
    })().catch((error: unknown) => {
      if (__DEV__) console.warn('Automatic Cloud Sync failed', error);
    });

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [
    actions,
    enabled,
  ]);

  useEffect(() => {
    if (!enabled) {
      lastSignatureRef.current = undefined;
      return;
    }

    const isFirstEnabledRun = lastSignatureRef.current === undefined;
    const changed = !isFirstEnabledRun && lastSignatureRef.current !== localSignature;
    lastSignatureRef.current = localSignature;

    const timer = setTimeout(
      () => void reconcile(changed),
      changed ? CHANGE_DEBOUNCE_MS : 350,
    );
    return () => clearTimeout(timer);
  }, [enabled, localSignature, reconcile]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reconcile(false);
    });
    return () => subscription.remove();
  }, [enabled, reconcile]);
}
