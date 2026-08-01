export type AutoSyncAction =
  | 'skip'
  | 'seed_cloud'
  | 'pull_cloud'
  | 'push_local'
  | 'in_sync'
  | 'conflict';

interface DetermineAutoSyncActionParams {
  localPayload: unknown;
  cloudPayload: unknown | null;
  cloudUpdatedAt: string | undefined;
  localLastSyncedAt: string | undefined;
  localKeyId: string | undefined;
  phraseKeyId: string;
  localIsDirty: boolean;
}

export function validateImportedSettings(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.cards) || !Array.isArray(obj.rules)) {
    return false;
  }

  if (!obj.settings || typeof obj.settings !== 'object' || Array.isArray(obj.settings)) {
    return false;
  }

  const settings = obj.settings as Record<string, unknown>;
  if ('autoSyncEnabled' in settings && typeof settings.autoSyncEnabled !== 'boolean') {
    return false;
  }
  if ('rememberCloudSyncCode' in settings && typeof settings.rememberCloudSyncCode !== 'boolean') {
    return false;
  }
  if ('cloudSyncLastSyncedAt' in settings && typeof settings.cloudSyncLastSyncedAt !== 'string') {
    return false;
  }
  if ('cloudSyncKeyId' in settings && typeof settings.cloudSyncKeyId !== 'string') {
    return false;
  }

  return true;
}

export function hasPrimaryData(payload: unknown): boolean {
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

export function createComparableSnapshot(payload: unknown): string {
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
    delete settings.cloudSyncLocalChangedAt;
    delete settings.cloudSyncMnemonic;
    delete settings.rememberCloudSyncCode;
    delete settings.autoSyncEnabled;
  }

  if (root.ynab && typeof root.ynab === 'object') {
    const ynab = root.ynab as Record<string, unknown>;
    delete ynab.pat;
    delete ynab.lastSync;
  }

  return JSON.stringify(toStableObject(root));
}

export function determineAutoSyncAction(params: DetermineAutoSyncActionParams): AutoSyncAction {
  if (!params.cloudPayload) {
    return hasPrimaryData(params.localPayload) || params.localIsDirty
      ? 'seed_cloud'
      : 'skip';
  }

  if (!validateImportedSettings(params.cloudPayload)) {
    throw new Error('Invalid settings data');
  }

  const localSnapshot = createComparableSnapshot(params.localPayload);
  const cloudSnapshot = createComparableSnapshot(params.cloudPayload);
  if (localSnapshot === cloudSnapshot) {
    return 'in_sync';
  }

  const localRevision = params.localLastSyncedAt
    ? Date.parse(params.localLastSyncedAt)
    : Number.NaN;
  const cloudRevision = params.cloudUpdatedAt
    ? Date.parse(params.cloudUpdatedAt)
    : Number.NaN;
  const hasSharedBase = params.localKeyId === params.phraseKeyId
    && Number.isFinite(localRevision)
    && Number.isFinite(cloudRevision);

  if (!hasSharedBase) {
    return params.localIsDirty ? 'conflict' : 'pull_cloud';
  }

  if (cloudRevision < localRevision) {
    // A stale read must never roll local state back or become the base of a push.
    return 'conflict';
  }

  if (cloudRevision > localRevision) {
    return params.localIsDirty ? 'conflict' : 'pull_cloud';
  }

  return 'push_local';
}

interface LocalSnapshotCheckParams {
  expectedPayload: unknown;
  expectedDirtyMarker: string | undefined;
  currentPayload: unknown;
  currentDirtyMarker: string | undefined;
}

/** Prevent a cloud pull from replacing edits made while the request was in flight. */
export function isLocalSnapshotCurrent(params: LocalSnapshotCheckParams): boolean {
  return params.currentDirtyMarker === params.expectedDirtyMarker
    && createComparableSnapshot(params.currentPayload) === createComparableSnapshot(params.expectedPayload);
}
