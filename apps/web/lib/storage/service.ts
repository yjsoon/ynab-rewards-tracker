import type { YnabFlagColor } from '@ynab-counter/app-core/ynab';

import { STORAGE_KEY, STORAGE_VERSION, STORAGE_VERSION_KEY } from '@ynab-counter/app-core/storage';
import { applyStorageMigrations } from '@ynab-counter/app-core/storage';
import {
  areHiddenCardListsEqual,
  createDefaultStorage,
  normaliseCard,
  normaliseHiddenCards,
  normaliseThemeGroup,
  pruneThemeGroups,
} from '@ynab-counter/app-core/storage';
import type {
  AppSettings,
  CreditCard,
  HiddenCard,
  HiddenCardReason,
  RewardCalculation,
  RewardRule,
  StorageData,
  TagMapping,
  ThemeGroup,
  YnabConnection,
} from '@ynab-counter/app-core/storage';
import type {
  MutableCard,
  MutableStorageData,
  MutableThemeGroup,
} from '@ynab-counter/app-core/storage';

export class StorageService {
  private ensureVersion(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
      if (storedVersion !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('StorageService.ensureVersion: Failed to access localStorage:', error);
      }
    }
  }

  private getStorage(): StorageData {
    if (typeof window === 'undefined') {
      return createDefaultStorage();
    }

    this.ensureVersion();

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as MutableStorageData;

        applyStorageMigrations(data);

        if (Array.isArray(data.cards)) {
          const flagNames = data.cachedData?.flagNames;
          data.cards = data.cards.map((card) =>
            normaliseCard({ ...card } as MutableCard, flagNames)
          );
        }

        pruneThemeGroups(data);

        data.hiddenCards = normaliseHiddenCards(data.hiddenCards || []);

        return data;
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to parse localStorage:', error);
      }
    }

    return createDefaultStorage();
  }

  private setStorage(data: StorageData): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to set localStorage:', error);
      }
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

  getDashboardViewMode(): 'summary' | 'detailed' {
    const mode = this.getSettings().dashboardViewMode;
    return mode === 'summary' || mode === 'detailed' ? mode : 'summary';
  }

  setDashboardViewMode(mode: 'summary' | 'detailed'): void {
    this.updateSettings({ dashboardViewMode: mode });
  }

  getPAT(): YnabConnection['pat'] {
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
    storage.ynab.selectedBudgetId = budgetId;
    storage.ynab.selectedBudgetName = budgetName;
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
    const normalisedCard = normaliseCard({ ...card } as MutableCard, storage.cachedData?.flagNames);
    const index = storage.cards.findIndex((c) => c.id === card.id);
    if (index >= 0) {
      storage.cards[index] = normalisedCard;
    } else {
      storage.cards.push(normalisedCard);
    }
    pruneThemeGroups(storage as MutableStorageData);
    this.setStorage(storage);
  }

  deleteCard(cardId: string): void {
    const storage = this.getStorage();
    storage.cards = storage.cards.filter((c) => c.id !== cardId);
    storage.rules = storage.rules.filter((r) => r.cardId !== cardId);
    storage.tagMappings = storage.tagMappings.filter((m) => m.cardId !== cardId);
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
    const index = storage.rules.findIndex((r) => r.id === rule.id);
    if (index >= 0) {
      storage.rules[index] = rule;
    } else {
      storage.rules.push(rule);
    }
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

    const existingIndex = typeof candidate.id === 'string'
      ? storage.themeGroups.findIndex((g) => g.id === candidate.id)
      : -1;

    const fallbackPriority = existingIndex >= 0
      ? storage.themeGroups[existingIndex].priority
      : storage.themeGroups.length;

    const normalisedGroup = normaliseThemeGroup({
      ...candidate,
    } as MutableThemeGroup, storage, fallbackPriority);

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
    storage.themeGroups = storage.themeGroups.filter((group) => group.id !== groupId);
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
    const index = storage.tagMappings.findIndex((m) => m.id === mapping.id);
    if (index >= 0) {
      storage.tagMappings[index] = mapping;
    } else {
      storage.tagMappings.push(mapping);
    }
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
      (c) => c.cardId === calculation.cardId && c.ruleId === calculation.ruleId && c.period === calculation.period,
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
      (c) => !(c.cardId === cardId && c.ruleId === ruleId && c.period === period),
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
    storage.calculations = (storage.calculations || []).filter((c) => c.period !== period);
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

  getCachedData(): StorageData['cachedData'] {
    return this.getStorage().cachedData;
  }

  setCachedData(data: StorageData['cachedData']): void {
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
        normaliseCard({ ...card } as MutableCard, storage.cachedData?.flagNames)
      );
    }

    pruneThemeGroups(storage);
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

  hideCard(cardId: string, hiddenUntil: string, reason: HiddenCardReason = 'maximum_spend_reached'): void {
    const storage = this.getStorage() as MutableStorageData;
    const existing = storage.hiddenCards || [];
    const expiry = new Date(hiddenUntil);

    if (Number.isNaN(expiry.getTime())) {
      throw new Error('Invalid hiddenUntil date');
    }

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

    storage.hiddenCards = normaliseHiddenCards(existing.filter((entry) => entry.cardId !== cardId));
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

  exportSettings(): string {
    const storage = this.getStorage();
    const exportData = {
      ...storage,
      ynab: { ...storage.ynab, pat: undefined },
    };
    return JSON.stringify(exportData, null, 2);
  }

  importSettings(jsonString: string): void {
    try {
      const imported = JSON.parse(jsonString);
      const storage = this.getStorage() as MutableStorageData;

      const pat = storage.ynab.pat;
      Object.assign(storage, imported);
      if (pat) {
        storage.ynab.pat = pat;
      }

      pruneThemeGroups(storage);
      this.setStorage(storage);
    } catch (error) {
      throw new Error('Invalid settings file');
    }
  }

  clearAll(): void {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_VERSION_KEY);
  }
}
