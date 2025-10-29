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
  Transaction,
} from '@ynab-counter/app-core/storage';
import type {
  MutableCard,
  MutableStorageData,
  MutableThemeGroup,
} from '@ynab-counter/app-core/storage';

const PAT_SECURE_STORE_KEY = 'ynab_counter_pat';
const LEGACY_PAT_SECURE_STORE_KEY = 'ynab_counter_pat_legacy';

export function normalizePeriod(period: string) {
  if (!period.includes(' → ')) {
    return { start: period, end: period };
  }
  const [start, end] = period.split(' → ');
  return { start, end };
}

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

    if (!this.loadPromise) {
      this.loadPromise = this.performLoad();
    }

    return this.loadPromise;
  }

  private async performLoad(): Promise<StorageData> {
    const storedVersion = await AsyncStorageService.getString(STORAGE_VERSION_KEY);
    if (storedVersion !== STORAGE_VERSION) {
      await AsyncStorageService.remove(STORAGE_KEY);
      await AsyncStorageService.setString(STORAGE_VERSION_KEY, STORAGE_VERSION);
    }

    try {
      const stored = await AsyncStorageService.getString(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as MutableStorageData;

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
            await SecureStore.deleteItemAsync(LEGACY_PAT_SECURE_STORE_KEY);
            delete data.ynab.pat;
          } catch (error) {
            console.error('Failed to migrate PAT to SecureStore', error);
          }
        }

        pruneThemeGroups(data);
        data.hiddenCards = normaliseHiddenCards(data.hiddenCards || []);

        this.cache = data;
        return data;
      }
    } catch (error) {
      console.error('Failed to parse mobile storage payload', error);
    }

    const fallback = createDefaultStorage();
    this.cache = fallback;
    return fallback;
  }

  private async save(data: StorageData): Promise<void> {
    try {
      await AsyncStorageService.setString(STORAGE_KEY, JSON.stringify(data));
      await AsyncStorageService.setString(STORAGE_VERSION_KEY, STORAGE_VERSION);
      this.cache = data;
    } catch (error) {
      console.error('Failed to persist mobile storage payload', error);
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
    delete storage.ynab.selectedBudgetId;
    delete storage.ynab.selectedBudgetName;
    storage.ynab.trackedAccountIds = [];
    storage.calculations = [];
    storage.cachedData = undefined;
  }

  async resetConnectionState(): Promise<void> {
    const storage = await this.load() as MutableStorageData;
    this.wipeConnectionState(storage);
    await this.save(storage);
  }

  async getPAT(): Promise<YnabConnection['pat']> {
    let securePat = await SecureStore.getItemAsync(PAT_SECURE_STORE_KEY);
    if (!securePat) {
      securePat = await SecureStore.getItemAsync(LEGACY_PAT_SECURE_STORE_KEY);
      if (securePat) {
        await SecureStore.setItemAsync(PAT_SECURE_STORE_KEY, securePat);
        await SecureStore.deleteItemAsync(LEGACY_PAT_SECURE_STORE_KEY);
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
    }

    return legacyPat;
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
    await SecureStore.deleteItemAsync(PAT_SECURE_STORE_KEY);
    await SecureStore.deleteItemAsync(LEGACY_PAT_SECURE_STORE_KEY);
    const storage = await this.load() as MutableStorageData;
    if (storage.ynab.pat) {
      delete storage.ynab.pat;
    }
    this.wipeConnectionState(storage);
    await this.save(storage);
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
    const index = storage.cards.findIndex((existing) => existing.id === card.id);

    if (index >= 0) {
      storage.cards[index] = normalised;
    } else {
      storage.cards.push(normalised);
    }

    pruneThemeGroups(storage as MutableStorageData);
    await this.save(storage);
  }

  async deleteCard(cardId: string): Promise<void> {
    const storage = await this.load();
    storage.cards = storage.cards.filter((card) => card.id !== cardId);
    storage.rules = storage.rules.filter((rule) => rule.cardId !== cardId);
    storage.tagMappings = storage.tagMappings.filter((mapping) => mapping.cardId !== cardId);
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
    const index = storage.rules.findIndex((existing) => existing.id === rule.id);

    if (index >= 0) {
      storage.rules[index] = rule;
    } else {
      storage.rules.push(rule);
    }

    await this.save(storage);
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
    const index = storage.tagMappings.findIndex((existing) => existing.id === mapping.id);

    if (index >= 0) {
      storage.tagMappings[index] = mapping;
    } else {
      storage.tagMappings.push(mapping);
    }

    await this.save(storage);
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
      period: `${normalizedPeriod.start} → ${normalizedPeriod.end}`
    };

    if (index >= 0) {
      storage.calculations[index] = nextEntry;
    } else {
      storage.calculations.push(nextEntry);
    }

    await this.save(storage);
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
    const expiry = new Date(hiddenUntil);

    if (Number.isNaN(expiry.getTime())) {
      throw new Error('Invalid hiddenUntil date');
    }

    const next = (storage.hiddenCards || []).filter((entry) => entry.cardId !== cardId);
    next.push({
      cardId,
      hiddenUntil: expiry.toISOString(),
      reason,
    });

    storage.hiddenCards = normaliseHiddenCards(next);
    await this.save(storage);
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

  private sanitizeTransactionForCache(txn: Transaction | CachedTransaction): CachedTransaction | null {
    if (
      typeof txn.id !== 'string' ||
      typeof txn.date !== 'string' ||
      typeof txn.amount !== 'number' ||
      typeof txn.account_id !== 'string'
    ) {
      return null;
    }

    return {
      id: txn.id,
      date: txn.date,
      amount: txn.amount,
      account_id: txn.account_id,
      payee_name: txn.payee_name ?? null,
      category_name: txn.category_name ?? null,
      flag_color: txn.flag_color ?? null,
      flag_name: txn.flag_name ?? null,
      cleared: txn.cleared ?? null,
      approved: txn.approved,
    };
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

    const normalisedIds = [...trackedAccountIds].sort().join(',');
    const now = Date.now();

    const match = entries.find((entry) => {
      const entryIds = [...entry.trackedAccountIds].sort().join(',');
      return entry.budgetId === budgetId && entry.sinceDate === sinceDate && entryIds === normalisedIds;
    });

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
      .map((txn) => this.sanitizeTransactionForCache(txn))
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

    const sanitized = payload.transactions
      .map((txn) => this.sanitizeTransactionForCache(txn))
      .filter((txn): txn is CachedTransaction => txn !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, StorageService.DASHBOARD_CACHE_LIMIT);

    const normalized: DashboardTransactionsCacheEntry = {
      budgetId: payload.budgetId,
      sinceDate: payload.sinceDate,
      fetchedAt: payload.fetchedAt,
      trackedAccountIds: [...payload.trackedAccountIds].sort(),
      transactions: sanitized,
      accounts: payload.accounts,
    };

    const normalizedKey = `${normalized.budgetId}::${normalized.sinceDate}::${normalized.trackedAccountIds.join(',')}`;
    const filtered = entries.filter((existing) => {
      const existingKey = `${existing.budgetId}::${existing.sinceDate}::${[...existing.trackedAccountIds].sort().join(',')}`;
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
    const exportData = {
      ...storage,
      ynab: { ...storage.ynab, pat: undefined },
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importSettings(jsonString: string): Promise<void> {
    try {
      const imported = JSON.parse(jsonString);
      const storage = await this.load() as MutableStorageData;
      const pat = storage.ynab.pat;

      Object.assign(storage, imported);
      if (pat) {
        storage.ynab.pat = pat;
      }

      pruneThemeGroups(storage);
      storage.hiddenCards = normaliseHiddenCards(storage.hiddenCards || []);
      await this.save(storage);
    } catch (error) {
      throw new Error('Invalid settings file');
    }
  }

  async clearAll(): Promise<void> {
    await AsyncStorageService.remove(STORAGE_KEY);
    await AsyncStorageService.remove(STORAGE_VERSION_KEY);
    this.cache = null;
    this.loadPromise = null;
  }
}

export const storage = StorageService.getInstance();
