import {
  applyStorageMigrations,
  createDefaultStorage,
  normaliseCard,
  normaliseHiddenCards,
  normaliseThemeGroup,
  pruneThemeGroups,
  type MutableStorageData,
  type StorageData,
} from '../storage';

function sanitizeSettings(settings: StorageData['settings']): StorageData['settings'] {
  const formatter = settings.statementFormatter
    ? { ...settings.statementFormatter, apiKeys: undefined }
    : undefined;

  return {
    ...settings,
    cloudSyncKeyId: undefined,
    cloudSyncLastSyncedAt: undefined,
    cloudSyncLocalChangedAt: undefined,
    cloudSyncMnemonic: undefined,
    rememberCloudSyncCode: undefined,
    autoSyncEnabled: undefined,
    statementFormatter: formatter,
  };
}

/**
 * Builds the encrypted, cross-device snapshot. Transaction caches, calculated
 * values, credentials, recovery phrases and provider keys are device-local.
 */
export function createCloudSyncPayload(data: StorageData): StorageData {
  return {
    ynab: {
      selectedBudgetId: data.ynab.selectedBudgetId,
      selectedBudgetName: data.ynab.selectedBudgetName,
      trackedAccountIds: [...(data.ynab.trackedAccountIds ?? [])],
    },
    cards: data.cards.map((card) => ({ ...card })),
    rules: data.rules.map((rule) => ({ ...rule })),
    tagMappings: data.tagMappings.map((mapping) => ({ ...mapping })),
    calculations: [],
    themeGroups: data.themeGroups.map((group) => ({
      ...group,
      subcategories: group.subcategories.map((reference) => ({ ...reference })),
      cards: group.cards.map((reference) => ({ ...reference })),
    })),
    hiddenCards: (data.hiddenCards ?? []).map((entry) => ({ ...entry })),
    settings: sanitizeSettings(data.settings),
  };
}

/**
 * Validates and normalises snapshots produced by both the web and mobile
 * clients. Local-only data is stripped even when an older web export includes
 * it, so importing a backup cannot move secrets or stale transactions.
 */
export function parseCloudSyncPayload(input: unknown): StorageData {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid Cloud Sync data: expected an object');
  }

  const candidate = input as Partial<MutableStorageData>;
  if (!Array.isArray(candidate.cards)) {
    throw new Error('Invalid Cloud Sync data: cards must be an array');
  }
  if (!Array.isArray(candidate.rules)) {
    throw new Error('Invalid Cloud Sync data: rules must be an array');
  }
  if (!candidate.settings || typeof candidate.settings !== 'object') {
    throw new Error('Invalid Cloud Sync data: settings are missing');
  }

  const defaults = createDefaultStorage() as MutableStorageData;
  const normalized: MutableStorageData = {
    ...defaults,
    ...candidate,
    ynab: {
      ...defaults.ynab,
      ...(candidate.ynab ?? {}),
      pat: undefined,
    },
    cards: candidate.cards.map((card) => ({ ...card })),
    rules: candidate.rules.map((rule) => ({ ...rule })),
    tagMappings: Array.isArray(candidate.tagMappings)
      ? candidate.tagMappings.map((mapping) => ({ ...mapping }))
      : [],
    calculations: [],
    themeGroups: Array.isArray(candidate.themeGroups)
      ? candidate.themeGroups.map((group) => ({ ...group }))
      : [],
    hiddenCards: Array.isArray(candidate.hiddenCards)
      ? candidate.hiddenCards.map((entry) => ({ ...entry }))
      : [],
    settings: sanitizeSettings(candidate.settings),
    cachedData: undefined,
  };

  applyStorageMigrations(normalized);
  normalized.cards = normalized.cards.map((card) =>
    normaliseCard({ ...card }, undefined),
  );
  normalized.themeGroups = normalized.themeGroups.map((group, index) =>
    normaliseThemeGroup({ ...group }, normalized, index),
  );
  normalized.hiddenCards = normaliseHiddenCards(normalized.hiddenCards ?? []);
  pruneThemeGroups(normalized);

  return normalized;
}
