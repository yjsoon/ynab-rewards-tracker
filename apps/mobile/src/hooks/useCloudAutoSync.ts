import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useStorage } from '@/contexts/StorageContext';
import {
  loadRememberedCloudSyncCode,
  restoreSettingsFromCloud,
  saveSettingsToCloud,
} from '@/lib/cloud-sync';
import { acquireCloudSyncLease } from '@/lib/cloud-sync-coordinator';
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
  const enabled = Boolean(
    status.isHydrated &&
    state.settings.autoSyncEnabled &&
    state.settings.rememberCloudSyncCode,
  );
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingForceRef = useRef(false);
  const enabledRef = useRef(enabled);
  const reconcileRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const wasEnabledRef = useRef(enabled);
  const lastAttemptRef = useRef(0);
  const lastSignatureRef = useRef<string | undefined>(undefined);

  enabledRef.current = enabled;

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
    if (inFlightRef.current) {
      if (force) pendingForceRef.current = true;
      return inFlightRef.current;
    }
    const storageGeneration = storage.captureGeneration();
    const assertCurrentGeneration = () => {
      if (!storage.isGenerationCurrent(storageGeneration)) {
        throw new Error('Automatic Cloud Sync was cancelled.');
      }
    };

    const run = (async () => {
      const lease = await acquireCloudSyncLease();
      try {
        lastAttemptRef.current = now;
      const currentSettings = await storage.getSettings();
      assertCurrentGeneration();
      if (!currentSettings.autoSyncEnabled || !currentSettings.rememberCloudSyncCode) {
        return;
      }
      const phrase = await loadRememberedCloudSyncCode();
      assertCurrentGeneration();
      if (!phrase) return;

      let restored: Awaited<ReturnType<typeof restoreSettingsFromCloud<unknown>>>;
      try {
        restored = await restoreSettingsFromCloud<unknown>(phrase);
        assertCurrentGeneration();
      } catch (error) {
        assertCurrentGeneration();
        if (!isMissingBackup(error)) throw error;
        const latestLocal = await readLocalSnapshot();
        assertCurrentGeneration();
        const seeded = await saveSettingsToCloud(phrase, latestLocal.payload);
        assertCurrentGeneration();
        const afterSeed = await storage.getSettings();
        assertCurrentGeneration();
        await storage.updateSettings({
          cloudSyncKeyId: seeded.keyId,
          cloudSyncLastSyncedAt: seeded.updatedAt,
          cloudSyncLocalChangedAt:
            afterSeed.cloudSyncLocalChangedAt === latestLocal.settings.cloudSyncLocalChangedAt
              ? undefined
              : afterSeed.cloudSyncLocalChangedAt,
        }, storageGeneration);
        await actions.refresh(storageGeneration);
        return;
      }

      const cloudPayload = parseCloudSyncPayload(restored.data);
      const latestLocal = await readLocalSnapshot();
      assertCurrentGeneration();
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
          expectedGeneration: storageGeneration,
        });
        assertCurrentGeneration();
        const afterImport = await storage.getSettings();
        assertCurrentGeneration();
        await storage.updateSettings({
          cloudSyncKeyId: restored.keyId,
          cloudSyncLastSyncedAt: restored.updatedAt,
          cloudSyncLocalChangedAt:
            afterImport.cloudSyncLocalChangedAt === localSettings.cloudSyncLocalChangedAt
              ? undefined
              : afterImport.cloudSyncLocalChangedAt,
        }, storageGeneration);
        await actions.refresh(storageGeneration);
        return;
      }

      const payloadsDiffer = comparable(localPayload) !== comparable(cloudPayload);
      if (payloadsDiffer && !orderKnown) {
        // Automatic sync cannot safely choose a winner without a shared key and timestamp.
        return;
      }

      if (payloadsDiffer) {
        const pushed = await saveSettingsToCloud(phrase, localPayload);
        assertCurrentGeneration();
        const afterPush = await storage.getSettings();
        assertCurrentGeneration();
        await storage.updateSettings({
          cloudSyncKeyId: pushed.keyId,
          cloudSyncLastSyncedAt: pushed.updatedAt,
          cloudSyncLocalChangedAt:
            afterPush.cloudSyncLocalChangedAt === localSettings.cloudSyncLocalChangedAt
              ? undefined
              : afterPush.cloudSyncLocalChangedAt,
        }, storageGeneration);
        await actions.refresh(storageGeneration);
        return;
      }

      if (
        localSettings.cloudSyncKeyId !== restored.keyId ||
        localSettings.cloudSyncLastSyncedAt !== restored.updatedAt ||
        localSettings.cloudSyncLocalChangedAt !== undefined
      ) {
        const latestSettings = await storage.getSettings();
        assertCurrentGeneration();
        await storage.updateSettings({
          cloudSyncKeyId: restored.keyId,
          cloudSyncLastSyncedAt: restored.updatedAt,
          cloudSyncLocalChangedAt:
            latestSettings.cloudSyncLocalChangedAt === localSettings.cloudSyncLocalChangedAt
              ? undefined
              : latestSettings.cloudSyncLocalChangedAt,
        }, storageGeneration);
        await actions.refresh(storageGeneration);
      }
      } finally {
        lease.release();
      }
    })().catch((error: unknown) => {
      if (__DEV__ && storage.isGenerationCurrent(storageGeneration)) {
        console.warn('Automatic Cloud Sync failed', error);
      }
    });

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
      const shouldRerun = pendingForceRef.current && enabledRef.current;
      pendingForceRef.current = false;
      if (shouldRerun) {
        void Promise.resolve()
          .then(async () => {
            const latestSettings = await storage.getSettings();
            if (
              enabledRef.current &&
              latestSettings.autoSyncEnabled &&
              latestSettings.rememberCloudSyncCode
            ) {
              await reconcileRef.current(true);
            }
          })
          .catch((error: unknown) => {
            if (__DEV__) console.warn('Queued automatic Cloud Sync failed', error);
          });
      }
    }
  }, [
    actions,
    enabled,
  ]);
  reconcileRef.current = reconcile;

  useEffect(() => {
    if (wasEnabledRef.current && !enabled) {
      actions.invalidatePendingOperations();
    }
    wasEnabledRef.current = enabled;
  }, [actions, enabled]);

  useEffect(() => {
    if (!enabled) {
      pendingForceRef.current = false;
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
