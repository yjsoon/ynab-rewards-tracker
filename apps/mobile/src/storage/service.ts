import * as SecureStore from 'expo-secure-store';
import { AsyncStorageService } from './async-storage';
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  STORAGE_VERSION_KEY,
  createDefaultStorage,
  applyStorageMigrations,
  normaliseCard,
  normaliseThemeGroup,
  pruneThemeGroups,
  normaliseHiddenCards,
  areHiddenCardListsEqual,
  sanitizeTransactionForCache,
  upsertById,
  createDashboardCacheKey,
  findDashboardCacheEntry,
  applyCardDeletion,
  validateHiddenUntilDate,
  normalizePeriod,
} from '@ynab-counter/app-core/storage';
import type {
  AppSettings,
  CreditCard,
  RewardRule,
  TagMapping,
  RewardCalculation,
  ThemeGroup,
  HiddenCard,
  YnabConnection,
  StorageData,
  DashboardTransactionsCacheEntry,
  DashboardTransactionsCachePayload,
  CachedTransaction,
} from '@ynab-counter/app-core/storage';
import type {
  MutableCard,
  MutableStorageData,
  MutableThemeGroup,
} from '@ynab-counter/app-core/storage';

const PAT_SECURE_STORE_KEY = 'ynab_counter_pat';
const LEGACY_PAT_SECURE_STORE_KEYS = [
  'ynab_counter_pat_legacy',
  'ynab-counter:pat',
] as const;

class StorageService {
  private static readonly DASHBOARD_CACHE_LIMIT = 500;
  private static readonly DASHBOARD_CACHE_MAX_ENTRIES = 5;
  private static instance: StorageService;
  private cache: StorageData | null = null;
  private loadPromise: Promise<StorageData> | null = null;

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async load(): Promise<StorageData> {
    if (this.cache) {
      return this.cache;
    }

    const pendingLoad = this.loadPromise ?? this.performLoad();
    this.loadPromise = pendingLoad;

    try {
      return await pendingLoad;
    } catch (error) {
      if (this.loadPromise === pendingLoad) {
        this.loadPromise = null;
      }
      throw error;
    }
  }

  private async performLoad(): Promise<StorageData> {
    const stored = await AsyncStorageService.getString(STORAGE_KEY);

    if (stored) {
      let data: MutableStorageData;
      try {
        data = JSON.parse(stored) as MutableStorageData;
      } catch (error) {
        if (__DEV__) {
          console.error('Failed to parse mobile storage payload', error);
        }
        const fallback = createDefaultStorage();
        await this.save(fallback);
        return fallback;
      }

      // A version change is not itself a reason to discard valid local data.
      // Run all available migrations first, then persist at the current version.
      applyStorageMigrations(data);

      if (Array.isArray(data.cards)) {
        const flagNames = data.cachedData?.flagNames;
        data.cards = data.cards.map((card) =>
          normaliseCard({ ...card } as MutableCard, flagNames)
        );
      }

      if (data.ynab?.pat) {
        try {
          await SecureStore.setItemAsync(PAT_SECURE_STORE_KEY, data.ynab.pat);
          await Promise.all(
            LEGACY_PAT_SECURE_STORE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
          );
          delete data.ynab.pat;
        } catch (error) {
          if (__DEV__) {
            console.error('Failed to migrate PAT to SecureStore', error);
          }
        }
      }

      pruneThemeGroups(data);
      data.hiddenCards = normaliseHiddenCards(data.hiddenCards || []);

      await this.save(data);
      return data;
    }

    const fallback = createDefaultStorage();
    await this.save(fallback);
    return fallback;
  }

  private async save(data: StorageData): Promise<void> {
    try {
      await AsyncStorageService.setString(STORAGE_KEY, JSON.stringify(data));
      await AsyncStorageService.setString(STORAGE_VERSION_KEY, STORAGE_VERSION);
      this.cache = data;
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to persist mobile storage payload', error);
      }
      throw error;
    }
  }

  private shallowEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return false;
      }
    }
    return true;
  }

  async getSettings(): Promise<AppSettings> {
    return (await this.load()).settings || {};
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    const storage = await this.load();
    storage.settings = {
      ...storage.settings,
      ...settings,
    };
    await this.save(storage);
  }

  private wipeConnectionState(storage: MutableStorageData): void {
    delete storage.ynab.lastSync;
    delete storage.ynab.selectedBudgetId;
    delete storage.ynab.selectedBudgetName;
    storage.ynab.trackedAccountIds = [];
    storage.calculations = [];
    storage.cachedData = undefined;
  }

  private async deleteSecurePAT(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(PAT_SECURE_STORE_KEY),
      ...LEGACY_PAT_SECURE_STORE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
    ]);
  }

  async resetConnectionState(): Promise<void> {
    const storage = await this.load() as MutableStorageData;
    this.wipeConnectionState(storage);
    await this.save(storage);
  }

  async getPAT(): Promise<YnabConnection['pat']> {
    let securePat = await SecureStore.getItemAsync(PAT_SECURE_STORE_KEY);
    if (!securePat) {
      for (const legacyKey of LEGACY_PAT_SECURE_STORE_KEYS) {
        securePat = await SecureStore.getItemAsync(legacyKey);
        if (securePat) {
          await SecureStore.setItemAsync(PAT_SECURE_STORE_KEY, securePat);
          await Promise.all(
            LEGACY_PAT_SECURE_STORE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
          );
          break;
        }
      }
    }
    if (securePat && securePat.length > 0) {
      return securePat;
    }

    const storage = await this.load();
    const legacyPat = storage.ynab.pat;
    if (legacyPat) {
      await SecureStore.setItemAsync(PAT_SECURE_STORE_KEY, legacyPat);
      delete storage.ynab.pat;
      await this.save(storage);
      return legacyPat;
    }

    // performLoad may have migrated an embedded PAT before this call resumed.
    return (await SecureStore.getItemAsync(PAT_SECURE_STORE_KEY)) ?? undefined;
  }

  async setPAT(pat: string): Promise<void> {
    await SecureStore.setItemAsync(PAT_SECURE_STORE_KEY, pat);
    const storage = await this.load();
    if (storage.ynab.pat) {
      delete storage.ynab.pat;
      await this.save(storage);
    }
  }

  async clearPAT(): Promise<void> {
    try {
      const storage = await this.load() as MutableStorageData;
      if (storage.ynab.pat) {
        delete storage.ynab.pat;
      }
      this.wipeConnectionState(storage);
      await this.save(storage);
    } finally {
      // Delete after loading so an embedded legacy PAT cannot be migrated back
      // into SecureStore during the clear operation.
      await this.deleteSecurePAT();
    }
  }

  async clearBudgetSelection(): Promise<void> {
    const storage = await this.load();
    delete storage.ynab.selectedBudgetId;
    delete storage.ynab.selectedBudgetName;
    await this.save(storage);
  }

  async getSelectedBudget(): Promise<{ id?: string; name?: string }> {
    const { selectedBudgetId, selectedBudgetName } = (await this.load()).ynab;
    return { id: selectedBudgetId, name: selectedBudgetName };
  }

  async setSelectedBudget(budgetId: string, budgetName: string): Promise<void> {
    const storage = await this.load();
    storage.ynab.selectedBudgetId = budgetId;
    storage.ynab.selectedBudgetName = budgetName;
    await this.save(storage);
  }

  async getTrackedAccountIds(): Promise<string[]> {
    const storage = await this.load();
    const ids = storage.ynab.trackedAccountIds || [];
    const unique = Array.from(new Set(ids));
    unique.sort();
    if (!this.shallowEqual(ids, unique)) {
      storage.ynab.trackedAccountIds = unique;
      await this.save(storage);
    }
    return unique;
  }

  async setTrackedAccountIds(accountIds: string[]): Promise<void> {
    const storage = await this.load();
    const unique = Array.from(new Set(accountIds));
    unique.sort();
    storage.ynab.trackedAccountIds = unique;
    await this.save(storage);
  }

  async isAccountTracked(accountId: string): Promise<boolean> {
    return (await this.getTrackedAccountIds()).includes(accountId);
  }

  async getCards(): Promise<CreditCard[]> {
    return (await this.load()).cards || [];
  }

  async saveCard(card: CreditCard): Promise<void> {
    const storage = await this.load();
    const normalised = normaliseCard({ ...card } as MutableCard, storage.cachedData?.flagNames);
    upsertById(storage.cards, normalised);
    pruneThemeGroups(storage as MutableStorageData);
    await this.save(storage);
  }

  async replaceCards(
    cards: readonly CreditCard[],
  ): Promise<Pick<StorageData, 'cards' | 'rules' | 'tagMappings' | 'calculations' | 'themeGroups'>> {
    const storage = await this.load() as MutableStorageData;
    const flagNames = storage.cachedData?.flagNames;
    const nextCards = cards.map((card) =>
      normaliseCard({ ...card } as MutableCard, flagNames)
    );
    const nextCardIds = new Set(nextCards.map((card) => card.id));

    storage.cards = nextCards;
    storage.rules = storage.rules.filter((rule) => nextCardIds.has(rule.cardId));
    storage.tagMappings = storage.tagMappings.filter((mapping) => nextCardIds.has(mapping.cardId));
    storage.calculations = storage.calculations.filter((calculation) => nextCardIds.has(calculation.cardId));
    storage.hiddenCards = (storage.hiddenCards ?? [])
      .filter((hiddenCard) => nextCardIds.has(hiddenCard.cardId));
    pruneThemeGroups(storage);
    await this.save(storage);
    return {
      cards: [...storage.cards],
      rules: [...storage.rules],
      tagMappings: [...storage.tagMappings],
      calculations: [...storage.calculations],
      themeGroups: [...storage.themeGroups],
    };
  }

  async deleteCard(cardId: string): Promise<void> {
    const storage = await this.load();
    applyCardDeletion(storage, cardId);
    pruneThemeGroups(storage as MutableStorageData);
    await this.save(storage);
  }

  async getRules(): Promise<RewardRule[]> {
    return (await this.load()).rules || [];
  }

  async getCardRules(cardId: string): Promise<RewardRule[]> {
    return (await this.getRules()).filter((rule) => rule.cardId === cardId);
  }

  async saveRule(rule: RewardRule): Promise<void> {
    const storage = await this.load();
    upsertById(storage.rules, rule);
    await this.save(storage);
  }

  async replaceRules(rules: readonly RewardRule[]): Promise<RewardRule[]> {
    const storage = await this.load();
    storage.rules = rules.map((rule) => ({ ...rule }));
    await this.save(storage);
    return [...storage.rules];
  }

  async deleteRule(ruleId: string): Promise<void> {
    const storage = await this.load();
    storage.rules = storage.rules.filter((rule) => rule.id !== ruleId);
    await this.save(storage);
  }

  async getThemeGroups(): Promise<ThemeGroup[]> {
    return (await this.load()).themeGroups || [];
  }

  async saveThemeGroup(group: ThemeGroup): Promise<void> {
    const storage = await this.load() as MutableStorageData;
    const nowIso = new Date().toISOString();
    const candidate = { ...group, updatedAt: nowIso };
    if (!candidate.createdAt) {
      candidate.createdAt = nowIso;
    }

    const existingIndex = typeof candidate.id === 'string'
      ? storage.themeGroups.findIndex((existing) => existing.id === candidate.id)
      : -1;

    const fallbackPriority = existingIndex >= 0
      ? storage.themeGroups[existingIndex].priority
      : storage.themeGroups.length;

    const normalised = normaliseThemeGroup({ ...candidate } as MutableThemeGroup, storage, fallbackPriority);

    if (existingIndex >= 0) {
      const existing = storage.themeGroups[existingIndex];
      normalised.priority = existing.priority;
      normalised.createdAt = existing.createdAt;
      storage.themeGroups[existingIndex] = normalised;
    } else {
      normalised.priority = fallbackPriority;
      storage.themeGroups.push(normalised);
    }

    pruneThemeGroups(storage);
    await this.save(storage);
  }

  async replaceThemeGroups(groups: readonly ThemeGroup[]): Promise<ThemeGroup[]> {
    const storage = await this.load() as MutableStorageData;
    storage.themeGroups = groups.map((group, index) =>
      normaliseThemeGroup({ ...group } as MutableThemeGroup, storage, index)
    );
    pruneThemeGroups(storage);
    await this.save(storage);
    return [...storage.themeGroups];
  }

  async deleteThemeGroup(groupId: string): Promise<void> {
    const storage = await this.load();
    storage.themeGroups = storage.themeGroups.filter((group) => group.id !== groupId);
    pruneThemeGroups(storage as MutableStorageData);
    await this.save(storage);
  }

  async getTagMappings(): Promise<TagMapping[]> {
    return (await this.load()).tagMappings || [];
  }

  async getCardTagMappings(cardId: string): Promise<TagMapping[]> {
    return (await this.getTagMappings()).filter((mapping) => mapping.cardId === cardId);
  }

  async saveTagMapping(mapping: TagMapping): Promise<void> {
    const storage = await this.load();
    upsertById(storage.tagMappings, mapping);
    await this.save(storage);
  }

  async replaceTagMappings(mappings: readonly TagMapping[]): Promise<TagMapping[]> {
    const storage = await this.load();
    storage.tagMappings = mappings.map((mapping) => ({ ...mapping }));
    await this.save(storage);
    return [...storage.tagMappings];
  }

  async deleteTagMapping(mappingId: string): Promise<void> {
    const storage = await this.load();
    storage.tagMappings = storage.tagMappings.filter((mapping) => mapping.id !== mappingId);
    await this.save(storage);
  }

  async getCalculations(): Promise<RewardCalculation[]> {
    return (await this.load()).calculations || [];
  }

  async getCardCalculations(cardId: string): Promise<RewardCalculation[]> {
    return (await this.getCalculations()).filter((calculation) => calculation.cardId === cardId);
  }

  async saveCalculation(calculation: RewardCalculation): Promise<void> {
    const storage = await this.load();
    const normalizedPeriod = normalizePeriod(calculation.period);
    const index = storage.calculations.findIndex((existing) => {
      if (existing.cardId !== calculation.cardId) {
        return false;
      }
      if ((existing.ruleId ?? null) !== (calculation.ruleId ?? null)) {
        return false;
      }
      const existingPeriod = normalizePeriod(existing.period);
      return existingPeriod.start === normalizedPeriod.start && existingPeriod.end === normalizedPeriod.end;
    });

    const nextEntry: RewardCalculation = {
      ...calculation,
    };

    if (index >= 0) {
      storage.calculations[index] = nextEntry;
    } else {
      storage.calculations.push(nextEntry);
    }

    await this.save(storage);
  }

  async replaceCalculations(
    calculations: readonly RewardCalculation[],
  ): Promise<RewardCalculation[]> {
    const storage = await this.load();
    storage.calculations = calculations.map((calculation) => ({ ...calculation }));
    await this.save(storage);
    return [...storage.calculations];
  }

  async deleteCalculation(cardId: string, ruleId: string, period: string): Promise<void> {
    const storage = await this.load();
    storage.calculations = storage.calculations.filter(
      (calculation) => !(calculation.cardId === cardId && calculation.ruleId === ruleId && calculation.period === period)
    );
    await this.save(storage);
  }

  async clearCalculations(): Promise<void> {
    const storage = await this.load();
    storage.calculations = [];
    await this.save(storage);
  }

  async deleteCalculationsForPeriod(period: string): Promise<void> {
    const storage = await this.load();
    storage.calculations = storage.calculations.filter((calculation) => calculation.period !== period);
    await this.save(storage);
  }

  async getLastComputedAt(): Promise<string | undefined> {
    return (await this.load()).cachedData?.lastUpdated;
  }

  async setLastComputedAt(isoString: string): Promise<void> {
    const storage = await this.load();
    storage.cachedData = storage.cachedData || {};
    storage.cachedData.lastUpdated = isoString;
    await this.save(storage);
  }

  async getCachedData(): Promise<StorageData['cachedData']> {
    return (await this.load()).cachedData;
  }

  async setCachedData(data: StorageData['cachedData']): Promise<void> {
    const storage = await this.load();
    storage.cachedData = data;
    await this.save(storage);
  }

  async getFlagNames(): Promise<Partial<Record<string, string>>> {
    return (await this.load()).cachedData?.flagNames ?? {};
  }

  async mergeFlagNames(flagNames: Partial<Record<string, string>>): Promise<void> {
    if (!flagNames || Object.keys(flagNames).length === 0) {
      return;
    }

    const storage = await this.load() as MutableStorageData;
    storage.cachedData = storage.cachedData || {};
    storage.cachedData.flagNames = {
      ...(storage.cachedData.flagNames ?? {}),
      ...flagNames,
    };

    if (Array.isArray(storage.cards)) {
      storage.cards = storage.cards.map((card) =>
        normaliseCard({ ...card } as MutableCard, storage.cachedData?.flagNames)
      );
    }

    pruneThemeGroups(storage);
    await this.save(storage);
  }

  async getHiddenCards(): Promise<HiddenCard[]> {
    const storage = await this.load() as MutableStorageData;
    const normalised = normaliseHiddenCards(storage.hiddenCards || []);

    if (!areHiddenCardListsEqual(storage.hiddenCards, normalised)) {
      storage.hiddenCards = normalised;
      await this.save(storage);
    }

    return normalised;
  }

  async hideCard(cardId: string, hiddenUntil: string, reason: HiddenCard['reason'] = 'maximum_spend_reached'): Promise<void> {
    const storage = await this.load() as MutableStorageData;
    const expiry = validateHiddenUntilDate(hiddenUntil);

    const next = (storage.hiddenCards || []).filter((entry) => entry.cardId !== cardId);
    next.push({
      cardId,
      hiddenUntil: expiry.toISOString(),
      reason,
    });

    storage.hiddenCards = normaliseHiddenCards(next);
    await this.save(storage);
  }

  async replaceHiddenCards(hiddenCards: readonly HiddenCard[]): Promise<HiddenCard[]> {
    const storage = await this.load() as MutableStorageData;
    storage.hiddenCards = normaliseHiddenCards([...hiddenCards]);
    await this.save(storage);
    return [...storage.hiddenCards];
  }

  async unhideCard(cardId: string): Promise<void> {
    const storage = await this.load() as MutableStorageData;
    storage.hiddenCards = normaliseHiddenCards((storage.hiddenCards || []).filter((entry) => entry.cardId !== cardId));
    await this.save(storage);
  }

  async cleanExpiredHiddenCards(): Promise<HiddenCard[]> {
    const storage = await this.load() as MutableStorageData;
    const cleaned = normaliseHiddenCards(storage.hiddenCards || []);

    if (!areHiddenCardListsEqual(storage.hiddenCards, cleaned)) {
      storage.hiddenCards = cleaned;
      await this.save(storage);
    }

    return cleaned;
  }

  async getDashboardTransactionsCache(
    budgetId: string,
    sinceDate: string,
    trackedAccountIds: string[],
    ttlMs = 5 * 60 * 1000
  ): Promise<DashboardTransactionsCacheEntry | null> {
    const storage = await this.load();
    const entries = storage.cachedData?.dashboardTransactions || [];
    if (entries.length === 0) {
      return null;
    }

    const now = Date.now();
    const match = findDashboardCacheEntry(entries, budgetId, sinceDate, trackedAccountIds);

    if (!match) {
      return null;
    }

    const age = now - new Date(match.fetchedAt).getTime();
    if (age > ttlMs) {
      return null;
    }

    if (!Array.isArray(match.transactions)) {
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

  async setDashboardTransactionsCache(payload: DashboardTransactionsCachePayload): Promise<void> {
    const storage = await this.load();
    storage.cachedData = storage.cachedData || {};
    const entries = storage.cachedData.dashboardTransactions || [];

    const allSanitized = payload.transactions
      .map((txn) => sanitizeTransactionForCache(txn))
      .filter((txn): txn is CachedTransaction => txn !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const sanitized = allSanitized.slice(0, StorageService.DASHBOARD_CACHE_LIMIT);

    const normalized: DashboardTransactionsCacheEntry = {
      budgetId: payload.budgetId,
      sinceDate: payload.sinceDate,
      fetchedAt: payload.fetchedAt,
      trackedAccountIds: [...payload.trackedAccountIds].sort(),
      isComplete: allSanitized.length <= StorageService.DASHBOARD_CACHE_LIMIT,
      transactions: sanitized,
      accounts: payload.accounts,
    };

    const normalizedKey = createDashboardCacheKey(normalized.budgetId, normalized.sinceDate, normalized.trackedAccountIds);
    const filtered = entries.filter((existing) => {
      const existingKey = createDashboardCacheKey(existing.budgetId, existing.sinceDate, existing.trackedAccountIds);
      return existingKey !== normalizedKey;
    });

    filtered.push(normalized);

    if (filtered.length > StorageService.DASHBOARD_CACHE_MAX_ENTRIES) {
      filtered.sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime());
      filtered.splice(StorageService.DASHBOARD_CACHE_MAX_ENTRIES);
    }

    storage.cachedData.dashboardTransactions = filtered;
    await this.save(storage);
  }

  async pruneDashboardTransactionsCache(ttlMs = 5 * 60 * 1000): Promise<void> {
    const storage = await this.load();
    const entries = storage.cachedData?.dashboardTransactions || [];
    if (entries.length === 0) {
      return;
    }

    const now = Date.now();
    const filtered = entries.filter((entry) => now - new Date(entry.fetchedAt).getTime() <= ttlMs);

    if (filtered.length === entries.length) {
      return;
    }

    storage.cachedData = storage.cachedData || {};
    storage.cachedData.dashboardTransactions = filtered;
    await this.save(storage);
  }

  async exportSettings(): Promise<string> {
    const storage = await this.load();
    const formatterSettings = storage.settings.statementFormatter
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
        statementFormatter: formatterSettings,
      },
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importSettings(jsonString: string): Promise<void> {
    try {
      const imported = JSON.parse(jsonString) as Partial<MutableStorageData>;
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
        throw new Error('Expected a storage object');
      }

      const storage = await this.load() as MutableStorageData;
      const localSettings = { ...storage.settings };
      const localFormatterApiKeys = storage.settings.statementFormatter?.apiKeys;

      Object.assign(storage, imported);

      const importedYnab = imported.ynab && typeof imported.ynab === 'object'
        ? imported.ynab
        : {};
      storage.ynab = { ...importedYnab };
      // PAT ownership stays exclusively with SecureStore. Imported payloads
      // must never replace it or reintroduce an embedded credential.
      delete storage.ynab.pat;

      storage.settings = storage.settings && typeof storage.settings === 'object'
        ? { ...storage.settings }
        : {};

      const localSettingKeys = [
        'cloudSyncKeyId',
        'cloudSyncLastSyncedAt',
        'cloudSyncLocalChangedAt',
        'cloudSyncMnemonic',
        'rememberCloudSyncCode',
        'autoSyncEnabled',
      ] as const;
      for (const key of localSettingKeys) {
        const localValue = localSettings[key];
        if (localValue === undefined) {
          Reflect.deleteProperty(storage.settings, key);
        } else {
          Object.assign(storage.settings, { [key]: localValue });
        }
      }

      if (localFormatterApiKeys) {
        storage.settings.statementFormatter = {
          ...(storage.settings.statementFormatter ?? {}),
          apiKeys: { ...localFormatterApiKeys },
        };
      } else if (storage.settings.statementFormatter) {
        const formatter = { ...storage.settings.statementFormatter };
        delete formatter.apiKeys;
        storage.settings.statementFormatter = formatter;
      }

      applyStorageMigrations(storage);
      storage.cards = Array.isArray(storage.cards)
        ? storage.cards.map((card) =>
            normaliseCard({ ...card } as MutableCard, storage.cachedData?.flagNames)
          )
        : [];
      pruneThemeGroups(storage);
      storage.hiddenCards = normaliseHiddenCards(storage.hiddenCards || []);
      await this.save(storage);
    } catch (error) {
      throw new Error('Invalid settings file');
    }
  }

  async clearAll(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorageService.remove(STORAGE_KEY),
        AsyncStorageService.remove(STORAGE_VERSION_KEY),
        SecureStore.deleteItemAsync(PAT_SECURE_STORE_KEY),
        ...LEGACY_PAT_SECURE_STORE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
      ]);
    } finally {
      this.cache = null;
      this.loadPromise = null;
    }
  }
}

export const storage = StorageService.getInstance();

// Re-export for backward compatibility (was previously defined in this file)
export { normalizePeriod } from '@ynab-counter/app-core/storage';
