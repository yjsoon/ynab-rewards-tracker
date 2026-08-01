import type { YnabFlagColor } from "@ynab-counter/app-core/ynab";
import {
  createCloudSyncPayload,
  resolveCloudSyncDirtyMarker,
} from "@ynab-counter/app-core/cloud-sync";

import {
  STORAGE_KEY,
  STORAGE_VERSION,
  STORAGE_VERSION_KEY,
} from "@ynab-counter/app-core/storage";
import { applyStorageMigrations } from "@ynab-counter/app-core/storage";
import {
  areHiddenCardListsEqual,
  createDefaultStorage,
  normaliseCard,
  normaliseHiddenCards,
  normaliseThemeGroup,
  pruneThemeGroups,
  sanitizeTransactionForCache,
  upsertById,
  createDashboardCacheKey,
  findDashboardCacheEntry,
  applyCardDeletion,
  invalidateDerivedDataAfterSettingsImport,
  validateHiddenUntilDate,
} from "@ynab-counter/app-core/storage";
import type {
  AppSettings,
  BudgetAccountsCacheAccount,
  BudgetAccountsCacheEntry,
  CreditCard,
  HiddenCard,
  HiddenCardReason,
  RewardCalculation,
  RewardRule,
  StorageData,
  TagMapping,
  ThemeGroup,
  YnabConnection,
  DashboardTransactionsCacheEntry,
  DashboardTransactionsCachePayload,
  CachedTransaction,
  StatementFormatterSettings,
} from "@ynab-counter/app-core/storage";
import type {
  MutableCard,
  MutableStorageData,
  MutableThemeGroup,
} from "@ynab-counter/app-core/storage";

export class StorageService {
  private static readonly DASHBOARD_CACHE_LIMIT = 500;
  private static readonly BUDGET_ACCOUNTS_CACHE_LIMIT = 5;
  private cachedStorage: StorageData | null = null;
  private hasCachedStorage = false;
  private hasAttachedStorageListener = false;

  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (
      event.key === null ||
      event.key === STORAGE_KEY ||
      event.key === STORAGE_VERSION_KEY
    ) {
      this.invalidateCache();
    }
  };

  private invalidateCache(): void {
    this.cachedStorage = null;
    this.hasCachedStorage = false;
  }

  private attachStorageListener(): void {
    if (typeof window === "undefined" || this.hasAttachedStorageListener) {
      return;
    }

    window.addEventListener("storage", this.handleStorageEvent);
    this.hasAttachedStorageListener = true;
  }

  private normalizeStorage(data: MutableStorageData): StorageData {
    applyStorageMigrations(data);

    if (Array.isArray(data.cards)) {
      const flagNames = data.cachedData?.flagNames;
      data.cards = data.cards.map((card) =>
        normaliseCard({ ...card } as MutableCard, flagNames),
      );
    }

    pruneThemeGroups(data);
    data.hiddenCards = normaliseHiddenCards(data.hiddenCards || []);

    return data;
  }

  private ensureVersion(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
      if (storedVersion !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
        this.invalidateCache();
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error(
          "StorageService.ensureVersion: Failed to access localStorage:",
          error,
        );
      }
    }
  }

  private getStorage(): StorageData {
    if (typeof window === "undefined") {
      return createDefaultStorage();
    }

    this.attachStorageListener();
    this.ensureVersion();

    if (this.hasCachedStorage && this.cachedStorage) {
      return this.cachedStorage;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = this.normalizeStorage(
          JSON.parse(stored) as MutableStorageData,
        );
        this.cachedStorage = data;
        this.hasCachedStorage = true;
        return data;
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to parse localStorage:", error);
      }
    }

    const emptyStorage = createDefaultStorage();
    this.cachedStorage = emptyStorage;
    this.hasCachedStorage = true;
    return emptyStorage;
  }

  private setStorage(data: StorageData): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const normalized = this.normalizeStorage(data as MutableStorageData);
      const previousRaw = localStorage.getItem(STORAGE_KEY);
      const previous = previousRaw
        ? this.normalizeStorage(JSON.parse(previousRaw) as MutableStorageData)
        : createDefaultStorage();
      if (
        JSON.stringify(createCloudSyncPayload(previous)) !==
        JSON.stringify(createCloudSyncPayload(normalized))
      ) {
        const currentMarker = normalized.settings.cloudSyncLocalChangedAt;
        const currentMarkerTime = currentMarker ? Date.parse(currentMarker) : Number.NaN;
        const now = Date.now();
        normalized.settings.cloudSyncLocalChangedAt = new Date(
          Number.isFinite(currentMarkerTime) && currentMarkerTime >= now
            ? currentMarkerTime + 1
            : now,
        ).toISOString();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      this.cachedStorage = normalized;
      this.hasCachedStorage = true;
    } catch (error) {
      this.invalidateCache();
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to set localStorage:", error);
      }
      throw error;
    }
  }

  getSettings(): AppSettings {
    return this.getStorage().settings || {};
  }

  updateSettings(settings: Partial<AppSettings>): void {
    const storage = this.getStorage();
    storage.settings = {
      ...storage.settings,
      ...settings,
    };
    this.setStorage(storage);
  }

  completeCloudSyncSnapshot(
    snapshotMarker: string | undefined,
    metadata: Pick<AppSettings, "cloudSyncKeyId" | "cloudSyncLastSyncedAt">,
  ): AppSettings {
    const storage = this.getStorage();
    storage.settings = {
      ...storage.settings,
      ...metadata,
      cloudSyncLocalChangedAt: resolveCloudSyncDirtyMarker(
        snapshotMarker,
        storage.settings.cloudSyncLocalChangedAt,
      ),
    };
    this.setStorage(storage);
    return { ...storage.settings };
  }

  getStatementFormatterSettings(): StatementFormatterSettings {
    const settings = this.getSettings();
    return settings.statementFormatter || {};
  }

  updateStatementFormatterSettings(
    settings: Partial<StatementFormatterSettings>,
  ): void {
    const storage = this.getStorage();
    storage.settings = storage.settings || {};
    const existing = storage.settings.statementFormatter || {};
    const next: StatementFormatterSettings = {
      ...existing,
      ...settings,
      apiKeys: {
        ...(existing.apiKeys || {}),
        ...(settings.apiKeys || {}),
      },
      modelByProvider: {
        ...(existing.modelByProvider || {}),
        ...(settings.modelByProvider || {}),
      },
    };
    storage.settings.statementFormatter = next;
    this.setStorage(storage);
  }

  getDashboardViewMode(): "summary" | "detailed" {
    const mode = this.getSettings().dashboardViewMode;
    return mode === "summary" || mode === "detailed" ? mode : "summary";
  }

  setDashboardViewMode(mode: "summary" | "detailed"): void {
    this.updateSettings({ dashboardViewMode: mode });
  }

  getPAT(): YnabConnection["pat"] {
    return this.getStorage().ynab.pat;
  }

  setPAT(pat: string): void {
    const storage = this.getStorage();
    storage.ynab.pat = pat;
    this.setStorage(storage);
  }

  clearPAT(): void {
    const storage = this.getStorage();
    delete storage.ynab.pat;
    this.setStorage(storage);
  }

  getSelectedBudget(): { id?: string; name?: string } {
    const { selectedBudgetId, selectedBudgetName } = this.getStorage().ynab;
    return { id: selectedBudgetId, name: selectedBudgetName };
  }

  setSelectedBudget(budgetId: string, budgetName: string): void {
    const storage = this.getStorage();
    if (budgetId && budgetName) {
      storage.ynab.selectedBudgetId = budgetId;
      storage.ynab.selectedBudgetName = budgetName;
    } else {
      delete storage.ynab.selectedBudgetId;
      delete storage.ynab.selectedBudgetName;
    }
    this.setStorage(storage);
  }

  getTrackedAccountIds(): string[] {
    return this.getStorage().ynab.trackedAccountIds || [];
  }

  setTrackedAccountIds(accountIds: string[]): void {
    const storage = this.getStorage();
    storage.ynab.trackedAccountIds = accountIds;
    this.setStorage(storage);
  }

  isAccountTracked(accountId: string): boolean {
    return this.getTrackedAccountIds().includes(accountId);
  }

  getCards(): CreditCard[] {
    return this.getStorage().cards || [];
  }

  saveCard(card: CreditCard): void {
    const storage = this.getStorage();
    const normalisedCard = normaliseCard(
      { ...card } as MutableCard,
      storage.cachedData?.flagNames,
    );
    upsertById(storage.cards, normalisedCard);
    pruneThemeGroups(storage as MutableStorageData);
    this.setStorage(storage);
  }

  deleteCard(cardId: string): void {
    const storage = this.getStorage();
    applyCardDeletion(storage, cardId);
    pruneThemeGroups(storage as MutableStorageData);
    this.setStorage(storage);
  }

  getRules(): RewardRule[] {
    return this.getStorage().rules || [];
  }

  getCardRules(cardId: string): RewardRule[] {
    return this.getRules().filter((r) => r.cardId === cardId);
  }

  saveRule(rule: RewardRule): void {
    const storage = this.getStorage();
    upsertById(storage.rules, rule);
    this.setStorage(storage);
  }

  deleteRule(ruleId: string): void {
    const storage = this.getStorage();
    storage.rules = storage.rules.filter((r) => r.id !== ruleId);
    this.setStorage(storage);
  }

  getThemeGroups(): ThemeGroup[] {
    return this.getStorage().themeGroups || [];
  }

  saveThemeGroup(group: ThemeGroup): void {
    const storage = this.getStorage() as MutableStorageData;
    const nowIso = new Date().toISOString();
    const candidate = { ...group, updatedAt: nowIso };
    if (!candidate.createdAt) {
      candidate.createdAt = nowIso;
    }

    const existingIndex =
      typeof candidate.id === "string"
        ? storage.themeGroups.findIndex((g) => g.id === candidate.id)
        : -1;

    const fallbackPriority =
      existingIndex >= 0
        ? storage.themeGroups[existingIndex].priority
        : storage.themeGroups.length;

    const normalisedGroup = normaliseThemeGroup(
      {
        ...candidate,
      } as MutableThemeGroup,
      storage,
      fallbackPriority,
    );

    if (existingIndex >= 0) {
      const existing = storage.themeGroups[existingIndex];
      normalisedGroup.priority = existing.priority;
      normalisedGroup.createdAt = existing.createdAt;
      storage.themeGroups[existingIndex] = normalisedGroup;
    } else {
      normalisedGroup.priority = fallbackPriority;
      storage.themeGroups.push(normalisedGroup);
    }

    pruneThemeGroups(storage);
    this.setStorage(storage);
  }

  deleteThemeGroup(groupId: string): void {
    const storage = this.getStorage();
    storage.themeGroups = storage.themeGroups.filter(
      (group) => group.id !== groupId,
    );
    pruneThemeGroups(storage as MutableStorageData);
    this.setStorage(storage);
  }

  getTagMappings(): TagMapping[] {
    return this.getStorage().tagMappings || [];
  }

  getCardTagMappings(cardId: string): TagMapping[] {
    return this.getTagMappings().filter((m) => m.cardId === cardId);
  }

  saveTagMapping(mapping: TagMapping): void {
    const storage = this.getStorage();
    upsertById(storage.tagMappings, mapping);
    this.setStorage(storage);
  }

  deleteTagMapping(mappingId: string): void {
    const storage = this.getStorage();
    storage.tagMappings = storage.tagMappings.filter((m) => m.id !== mappingId);
    this.setStorage(storage);
  }

  getCalculations(): RewardCalculation[] {
    return this.getStorage().calculations || [];
  }

  getCardCalculations(cardId: string): RewardCalculation[] {
    return this.getCalculations().filter((c) => c.cardId === cardId);
  }

  saveCalculation(calculation: RewardCalculation): void {
    const storage = this.getStorage();
    const index = storage.calculations.findIndex(
      (c) =>
        c.cardId === calculation.cardId &&
        c.ruleId === calculation.ruleId &&
        c.period === calculation.period,
    );
    if (index >= 0) {
      storage.calculations[index] = calculation;
    } else {
      storage.calculations.push(calculation);
    }
    this.setStorage(storage);
  }

  deleteCalculation(cardId: string, ruleId: string, period: string): void {
    const storage = this.getStorage();
    storage.calculations = storage.calculations.filter(
      (c) =>
        !(c.cardId === cardId && c.ruleId === ruleId && c.period === period),
    );
    this.setStorage(storage);
  }

  clearCalculations(): void {
    const storage = this.getStorage();
    storage.calculations = [];
    this.setStorage(storage);
  }

  deleteCalculationsForPeriod(period: string): void {
    const storage = this.getStorage();
    storage.calculations = (storage.calculations || []).filter(
      (c) => c.period !== period,
    );
    this.setStorage(storage);
  }

  getLastComputedAt(): string | undefined {
    return this.getStorage().cachedData?.lastUpdated;
  }

  setLastComputedAt(isoString: string): void {
    const storage = this.getStorage();
    storage.cachedData = storage.cachedData || {};
    storage.cachedData.lastUpdated = isoString;
    this.setStorage(storage);
  }

  getCachedData(): StorageData["cachedData"] {
    return this.getStorage().cachedData;
  }

  setCachedData(data: StorageData["cachedData"]): void {
    const storage = this.getStorage();
    storage.cachedData = data;
    this.setStorage(storage);
  }

  getFlagNames(): Partial<Record<YnabFlagColor, string>> {
    return this.getStorage().cachedData?.flagNames ?? {};
  }

  mergeFlagNames(flagNames: Partial<Record<YnabFlagColor, string>>): void {
    if (!flagNames || Object.keys(flagNames).length === 0) {
      return;
    }

    const storage = this.getStorage() as MutableStorageData;
    storage.cachedData = storage.cachedData || {};
    storage.cachedData.flagNames = {
      ...(storage.cachedData.flagNames ?? {}),
      ...flagNames,
    };

    if (Array.isArray(storage.cards)) {
      storage.cards = storage.cards.map((card) =>
        normaliseCard(
          { ...card } as MutableCard,
          storage.cachedData?.flagNames,
        ),
      );
    }

    pruneThemeGroups(storage);
    this.setStorage(storage);
  }

  getBudgetAccountsCache<
    TAccount extends BudgetAccountsCacheAccount = BudgetAccountsCacheAccount,
  >(
    budgetId: string,
    ttlMs = 5 * 60 * 1000,
    scopeKey?: string,
  ): TAccount[] | null {
    if (typeof window === "undefined") {
      return null;
    }

    const entries = this.getStorage().cachedData?.accounts || [];
    const normalizedScopeKey = scopeKey ?? "";
    const match = entries.find(
      (entry) =>
        entry.budgetId === budgetId &&
        (entry.scopeKey ?? "") === normalizedScopeKey,
    );

    if (!match) {
      return null;
    }

    const age = Date.now() - new Date(match.fetchedAt).getTime();
    if (age > ttlMs || !Array.isArray(match.accounts)) {
      return null;
    }

    const accounts = match.accounts.filter(
      (account): account is BudgetAccountsCacheAccount =>
        typeof account === "object" &&
        account !== null &&
        typeof account.id === "string" &&
        typeof account.name === "string",
    );

    if (accounts.length === 0) {
      return null;
    }

    return accounts as TAccount[];
  }

  setBudgetAccountsCache<TAccount extends BudgetAccountsCacheAccount>(
    budgetId: string,
    accounts: TAccount[],
    fetchedAt = new Date().toISOString(),
    scopeKey?: string,
  ): void {
    if (
      typeof window === "undefined" ||
      !Array.isArray(accounts) ||
      accounts.length === 0
    ) {
      return;
    }

    const sanitizedAccounts = accounts.filter(
      (account): account is TAccount =>
        typeof account === "object" &&
        account !== null &&
        typeof account.id === "string" &&
        typeof account.name === "string",
    );

    if (sanitizedAccounts.length === 0) {
      return;
    }

    const storage = this.getStorage() as MutableStorageData;
    storage.cachedData = storage.cachedData || {};
    const entries = storage.cachedData.accounts || [];
    const normalizedScopeKey = scopeKey ?? "";

    const nextEntry: BudgetAccountsCacheEntry = {
      budgetId,
      fetchedAt,
      scopeKey: normalizedScopeKey || undefined,
      accounts: sanitizedAccounts,
    };

    const filtered = entries.filter(
      (entry) =>
        entry.budgetId !== budgetId ||
        (entry.scopeKey ?? "") !== normalizedScopeKey,
    );
    filtered.push(nextEntry);
    filtered.sort(
      (a, b) =>
        new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime(),
    );

    if (filtered.length > StorageService.BUDGET_ACCOUNTS_CACHE_LIMIT) {
      filtered.splice(StorageService.BUDGET_ACCOUNTS_CACHE_LIMIT);
    }

    storage.cachedData.accounts = filtered;
    this.setStorage(storage);
  }

  getHiddenCards(): HiddenCard[] {
    const storage = this.getStorage() as MutableStorageData;
    const normalised = normaliseHiddenCards(storage.hiddenCards || []);

    if (!areHiddenCardListsEqual(storage.hiddenCards, normalised)) {
      storage.hiddenCards = normalised;
      this.setStorage(storage);
    }

    return normalised;
  }

  hideCard(
    cardId: string,
    hiddenUntil: string,
    reason: HiddenCardReason = "maximum_spend_reached",
  ): void {
    const storage = this.getStorage() as MutableStorageData;
    const existing = storage.hiddenCards || [];
    const expiry = validateHiddenUntilDate(hiddenUntil);

    const next = existing.filter((entry) => entry.cardId !== cardId);
    next.push({
      cardId,
      hiddenUntil: expiry.toISOString(),
      reason,
    });

    storage.hiddenCards = normaliseHiddenCards(next);
    this.setStorage(storage);
  }

  unhideCard(cardId: string): void {
    const storage = this.getStorage() as MutableStorageData;
    const existing = storage.hiddenCards || [];

    storage.hiddenCards = normaliseHiddenCards(
      existing.filter((entry) => entry.cardId !== cardId),
    );
    this.setStorage(storage);
  }

  cleanExpiredHiddenCards(): HiddenCard[] {
    const storage = this.getStorage() as MutableStorageData;
    const cleaned = normaliseHiddenCards(storage.hiddenCards || []);

    if (!areHiddenCardListsEqual(storage.hiddenCards, cleaned)) {
      storage.hiddenCards = cleaned;
      this.setStorage(storage);
    }

    return cleaned;
  }

  getDashboardTransactionsCache(
    budgetId: string,
    sinceDate: string,
    trackedAccountIds: string[],
    ttlMs = 5 * 60 * 1000,
  ): DashboardTransactionsCacheEntry | null {
    if (typeof window === "undefined") {
      return null;
    }

    const storage = this.getStorage();
    const entries = storage.cachedData?.dashboardTransactions || [];

    const now = Date.now();
    const match = findDashboardCacheEntry(
      entries,
      budgetId,
      sinceDate,
      trackedAccountIds,
    );

    if (!match) {
      return null;
    }

    const age = now - new Date(match.fetchedAt).getTime();
    if (age > ttlMs) {
      return null;
    }

    // Handle legacy data: sanitize transactions and limit to most recent using DASHBOARD_CACHE_LIMIT
    if (!Array.isArray(match.transactions)) {
      return null;
    }

    const isCompleteSnapshot =
      match.isComplete === true ||
      (match.isComplete === undefined &&
        match.transactions.length < StorageService.DASHBOARD_CACHE_LIMIT);

    if (!isCompleteSnapshot) {
      return null;
    }
    const sanitized = match.transactions
      .map((txn) => sanitizeTransactionForCache(txn))
      .filter((txn): txn is CachedTransaction => txn !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, StorageService.DASHBOARD_CACHE_LIMIT);

    return {
      ...match,
      transactions: sanitized,
    };
  }

  setDashboardTransactionsCache(
    payload: DashboardTransactionsCachePayload,
  ): void {
    if (typeof window === "undefined") {
      return;
    }

    const storage = this.getStorage();
    storage.cachedData = storage.cachedData || {};
    const entries = storage.cachedData.dashboardTransactions || [];

    // Sort transactions by date (newest first), sanitize, and limit to most recent
    const sanitized = [...payload.transactions]
      .map((txn) => sanitizeTransactionForCache(txn))
      .filter((txn): txn is CachedTransaction => txn !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const isComplete = sanitized.length <= StorageService.DASHBOARD_CACHE_LIMIT;
    const limitedTransactions = sanitized.slice(
      0,
      StorageService.DASHBOARD_CACHE_LIMIT,
    );

    // Normalize and sanitize entry
    const normalized: DashboardTransactionsCacheEntry = {
      budgetId: payload.budgetId,
      sinceDate: payload.sinceDate,
      fetchedAt: payload.fetchedAt,
      trackedAccountIds: [...payload.trackedAccountIds].sort(),
      isComplete,
      transactions: limitedTransactions,
      accounts: payload.accounts,
    };

    const normalizedKey = createDashboardCacheKey(
      normalized.budgetId,
      normalized.sinceDate,
      normalized.trackedAccountIds,
    );

    // Remove existing entry with same key
    const filtered = entries.filter((existing) => {
      const existingKey = createDashboardCacheKey(
        existing.budgetId,
        existing.sinceDate,
        existing.trackedAccountIds,
      );
      return existingKey !== normalizedKey;
    });

    if (!isComplete) {
      storage.cachedData.dashboardTransactions = filtered;
      this.setStorage(storage);
      return;
    }

    filtered.push(normalized);

    // Cap at 5 entries, remove oldest by fetchedAt
    if (filtered.length > 5) {
      filtered.sort(
        (a, b) =>
          new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime(),
      );
      filtered.splice(5);
    }

    storage.cachedData.dashboardTransactions = filtered;
    this.setStorage(storage);
  }

  pruneDashboardTransactionsCache(ttlMs = 5 * 60 * 1000): void {
    if (typeof window === "undefined") {
      return;
    }

    const storage = this.getStorage();
    const entries = storage.cachedData?.dashboardTransactions || [];

    if (entries.length === 0) {
      return;
    }

    const now = Date.now();
    const filtered = entries.filter((entry) => {
      const age = now - new Date(entry.fetchedAt).getTime();
      return age <= ttlMs;
    });

    if (filtered.length === entries.length) {
      return;
    }

    storage.cachedData = storage.cachedData || {};
    storage.cachedData.dashboardTransactions = filtered;
    this.setStorage(storage);
  }

  exportSettings(): string {
    const storage = this.getStorage();
    const formatterSettings = storage.settings?.statementFormatter
      ? {
          ...storage.settings.statementFormatter,
          apiKeys: undefined,
        }
      : undefined;
    const exportData = {
      ...storage,
      ynab: { ...storage.ynab, pat: undefined },
      settings: {
        ...storage.settings,
        cloudSyncMnemonic: undefined,
        rememberCloudSyncCode: undefined,
        autoSyncEnabled: undefined,
        statementFormatter: formatterSettings,
      },
    };
    return JSON.stringify(exportData, null, 2);
  }

  importSettings(jsonString: string): void {
    try {
      const imported = JSON.parse(jsonString) as Partial<MutableStorageData>;
      const storage = this.getStorage() as MutableStorageData;

      // Fix #5: Preserve sensitive local-only data (more explicit checks with optional chaining)
      const localYnab = { ...storage.ynab };
      const pat = localYnab.pat;
      const cloudSyncMnemonic = storage.settings?.cloudSyncMnemonic;
      const rememberCloudSyncCode = storage.settings?.rememberCloudSyncCode;
      const autoSyncEnabled = storage.settings?.autoSyncEnabled;
      const formatterApiKeys = storage.settings?.statementFormatter?.apiKeys;

      Object.assign(storage, imported);
      storage.ynab = this.mergeImportedYnabConnection(imported.ynab, localYnab, storage.cards);

      // Restore PAT if it exists (non-empty string)
      if (pat && typeof pat === "string") {
        storage.ynab.pat = pat;
      }

      // Restore cloudSyncMnemonic if it exists and is a valid string
      if (cloudSyncMnemonic && typeof cloudSyncMnemonic === "string") {
        storage.settings.cloudSyncMnemonic = cloudSyncMnemonic;
      }

      // Restore rememberCloudSyncCode preference (boolean type check)
      if (typeof rememberCloudSyncCode === "boolean") {
        storage.settings.rememberCloudSyncCode = rememberCloudSyncCode;
      }

      // Preserve per-device auto-sync preference
      if (typeof autoSyncEnabled === "boolean") {
        storage.settings.autoSyncEnabled = autoSyncEnabled;
      }

      if (formatterApiKeys) {
        storage.settings.statementFormatter =
          storage.settings.statementFormatter || {};
        storage.settings.statementFormatter.apiKeys = formatterApiKeys;
      }

      pruneThemeGroups(storage);
      invalidateDerivedDataAfterSettingsImport(storage);
      this.setStorage(storage);
    } catch (error) {
      throw new Error("Invalid settings file");
    }
  }

  private mergeImportedYnabConnection(
    importedYnab: Partial<YnabConnection> | undefined,
    localYnab: YnabConnection,
    cards: CreditCard[],
  ): YnabConnection {
    const imported =
      importedYnab && typeof importedYnab === "object" && !Array.isArray(importedYnab)
        ? importedYnab
        : {};

    const next: YnabConnection = { ...localYnab, ...imported };
    const importedBudgetId = this.nonEmptyString(imported.selectedBudgetId);
    const importedBudgetName = this.nonEmptyString(imported.selectedBudgetName);
    const localBudgetId = this.nonEmptyString(localYnab.selectedBudgetId);
    const localBudgetName = this.nonEmptyString(localYnab.selectedBudgetName);

    if (importedBudgetId && importedBudgetName) {
      next.selectedBudgetId = importedBudgetId;
      next.selectedBudgetName = importedBudgetName;
    } else if (localBudgetId && localBudgetName) {
      next.selectedBudgetId = localBudgetId;
      next.selectedBudgetName = localBudgetName;
    } else {
      delete next.selectedBudgetId;
      delete next.selectedBudgetName;
    }

    const importedTrackedIds = this.normaliseAccountIds(imported.trackedAccountIds);
    const cardAccountIds = this.normaliseAccountIds(
      cards.map((card) => card.ynabAccountId),
    );
    const localTrackedIds = this.normaliseAccountIds(localYnab.trackedAccountIds);
    const trackedAccountIds =
      importedTrackedIds.length > 0
        ? importedTrackedIds
        : cardAccountIds.length > 0
          ? cardAccountIds
          : localTrackedIds;

    if (trackedAccountIds.length > 0) {
      next.trackedAccountIds = trackedAccountIds;
    } else {
      delete next.trackedAccountIds;
    }

    return next;
  }

  private nonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private normaliseAccountIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0),
      ),
    ).sort();
  }

  clearAll(): void {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_VERSION_KEY);
    this.invalidateCache();
  }
}
