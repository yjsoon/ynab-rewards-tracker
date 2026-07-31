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

      const raw = JSON.parse(await storage.exportSettings()) as StorageData;
      const localPayload = createCloudSyncPayload(raw);

      let restored: Awaited<ReturnType<typeof restoreSettingsFromCloud<unknown>>>;
      try {
        restored = await restoreSettingsFromCloud<unknown>(phrase);
      } catch (error) {
        if (!isMissingBackup(error)) throw error;
        const seeded = await saveSettingsToCloud(phrase, localPayload);
        await actions.setSettings({
          cloudSyncKeyId: seeded.keyId,
          cloudSyncLastSyncedAt: seeded.updatedAt,
        });
        return;
      }

      const cloudPayload = parseCloudSyncPayload(restored.data);
      const lastLocalSync = state.settings.cloudSyncLastSyncedAt
        ? Date.parse(state.settings.cloudSyncLastSyncedAt)
        : Number.NaN;
      const cloudUpdated = Date.parse(restored.updatedAt);
      const sameKey = state.settings.cloudSyncKeyId === restored.keyId;
      const cloudIsNewer = sameKey && Number.isFinite(lastLocalSync) && cloudUpdated > lastLocalSync;

      if (cloudIsNewer) {
        await storage.importSettings(JSON.stringify(cloudPayload));
        await storage.updateSettings({
          cloudSyncKeyId: restored.keyId,
          cloudSyncLastSyncedAt: restored.updatedAt,
          rememberCloudSyncCode: true,
          autoSyncEnabled: true,
        });
        await actions.refresh();
        return;
      }

      if (comparable(localPayload) !== comparable(cloudPayload)) {
        const pushed = await saveSettingsToCloud(phrase, localPayload);
        await actions.setSettings({
          cloudSyncKeyId: pushed.keyId,
          cloudSyncLastSyncedAt: pushed.updatedAt,
        });
        return;
      }

      if (
        state.settings.cloudSyncKeyId !== restored.keyId ||
        state.settings.cloudSyncLastSyncedAt !== restored.updatedAt
      ) {
        await actions.setSettings({
          cloudSyncKeyId: restored.keyId,
          cloudSyncLastSyncedAt: restored.updatedAt,
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
    state.settings.cloudSyncKeyId,
    state.settings.cloudSyncLastSyncedAt,
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
