import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreditCard,
  RewardRule,
  RewardCalculation,
  AppSettings,
  ThemeGroup,
  HiddenCard,
  DashboardViewMode,
} from '@/lib/storage';
import { storage } from '@/lib/storage';
import { useStorageContext } from '@/contexts/StorageContext';

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_CARD_LIST: CreditCard[] = [];
const EMPTY_RULE_LIST: RewardRule[] = [];
const EMPTY_CALCULATION_LIST: RewardCalculation[] = [];
const EMPTY_SELECTED_BUDGET: { id?: string; name?: string } = {};
const EMPTY_THEME_GROUP_LIST: ThemeGroup[] = [];
const EMPTY_HIDDEN_CARD_LIST: HiddenCard[] = [];
const DEFAULT_SETTINGS: AppSettings = { theme: 'light', currency: 'USD', dashboardViewMode: 'summary' };

function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
}

function useStorageResource<T>(selector: () => T, fallback: T, dependency?: unknown) {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();
  const selectorRef = useRef(selector);
  const fallbackRef = useRef(fallback);
  const [value, setValue] = useState(fallback);

  selectorRef.current = selector;
  fallbackRef.current = fallback;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      setValue(fallbackRef.current);
      return;
    }

    setValue(selectorRef.current());
  }, [hasHydrated, refreshTrigger, dependency]);

  return { value, triggerRefresh, isLoading: !hasHydrated };
}

export function useYnabPAT() {
  const { value: pat, triggerRefresh, isLoading } = useStorageResource(() => storage.getPAT() || '', '');
  const setPAT = useCallback((newPAT: string) => {
    if (newPAT) {
      storage.setPAT(newPAT);
    } else {
      storage.clearPAT();
    }
    triggerRefresh();
  }, [triggerRefresh]);

  return { pat, setPAT, isLoading };
}

export function useCreditCards() {
  const { value: cards, triggerRefresh, isLoading } = useStorageResource(() => storage.getCards(), EMPTY_CARD_LIST);
  const saveCard = useCallback((card: CreditCard) => {
    storage.saveCard(card);
    triggerRefresh();
  }, [triggerRefresh]);

  const deleteCard = useCallback((cardId: string) => {
    storage.deleteCard(cardId);
    triggerRefresh();
  }, [triggerRefresh]);

  const updateCard = useCallback((card: CreditCard) => {
    storage.saveCard(card);
    triggerRefresh();
  }, [triggerRefresh]);

  return { cards, saveCard, updateCard, deleteCard, isLoading };
}

export function useSelectedBudget() {
  const {
    value: selectedBudget,
    triggerRefresh,
    isLoading,
  } = useStorageResource(() => storage.getSelectedBudget(), EMPTY_SELECTED_BUDGET);
  const setSelectedBudget = useCallback((budgetId: string, budgetName: string) => {
    storage.setSelectedBudget(budgetId, budgetName);
    triggerRefresh();
  }, [triggerRefresh]);

  return { selectedBudget, setSelectedBudget, isLoading };
}

export function useTrackedAccountIds() {
  const {
    value: trackedAccountIds,
    triggerRefresh,
    isLoading,
  } = useStorageResource(() => storage.getTrackedAccountIds(), EMPTY_STRING_ARRAY);
  const setTrackedAccountIds = useCallback((accountIds: string[]) => {
    storage.setTrackedAccountIds(accountIds);
    triggerRefresh();
  }, [triggerRefresh]);

  const isAccountTracked = useCallback(
    (accountId: string) => trackedAccountIds.includes(accountId),
    [trackedAccountIds]
  );

  return { trackedAccountIds, setTrackedAccountIds, isAccountTracked, isLoading };
}

export function useRewardRules(cardId?: string) {
  const { value: rules, triggerRefresh, isLoading } = useStorageResource(
    () => (cardId ? storage.getCardRules(cardId) : storage.getRules()),
    EMPTY_RULE_LIST,
    cardId
  );
  const saveRule = useCallback((rule: RewardRule) => {
    storage.saveRule(rule);
    triggerRefresh();
  }, [triggerRefresh]);

  const deleteRule = useCallback((ruleId: string) => {
    storage.deleteRule(ruleId);
    triggerRefresh();
  }, [triggerRefresh]);

  return { rules, saveRule, deleteRule, isLoading };
}

export function useRewardCalculations(cardId?: string) {
  const { value: calculations, triggerRefresh, isLoading } = useStorageResource(
    () => (cardId ? storage.getCardCalculations(cardId) : storage.getCalculations()),
    EMPTY_CALCULATION_LIST,
    cardId
  );
  const saveCalculation = useCallback((calculation: RewardCalculation) => {
    storage.saveCalculation(calculation);
    triggerRefresh();
  }, [triggerRefresh]);

  const deleteCalculation = useCallback((cardId: string, ruleId: string, period: string) => {
    storage.deleteCalculation(cardId, ruleId, period);
    triggerRefresh();
  }, [triggerRefresh]);

  const clearCalculations = useCallback(() => {
    storage.clearCalculations();
    triggerRefresh();
  }, [triggerRefresh]);

  return { calculations, saveCalculation, deleteCalculation, clearCalculations, isLoading };
}

export function useThemeGroups() {
  const { value: themeGroups, triggerRefresh, isLoading } = useStorageResource(
    () => storage.getThemeGroups(),
    EMPTY_THEME_GROUP_LIST
  );
  const saveThemeGroup = useCallback((group: ThemeGroup) => {
    storage.saveThemeGroup(group);
    triggerRefresh();
  }, [triggerRefresh]);

  const deleteThemeGroup = useCallback((groupId: string) => {
    storage.deleteThemeGroup(groupId);
    triggerRefresh();
  }, [triggerRefresh]);

  return {
    themeGroups,
    saveThemeGroup,
    deleteThemeGroup,
    isLoading,
  };
}

export function useHiddenCards() {
  const { value: hiddenCards, triggerRefresh, isLoading } = useStorageResource(
    () => storage.cleanExpiredHiddenCards(),
    EMPTY_HIDDEN_CARD_LIST
  );
  const hideCard = useCallback((cardId: string, hiddenUntil: string) => {
    storage.hideCard(cardId, hiddenUntil, 'maximum_spend_reached');
    triggerRefresh();
  }, [triggerRefresh]);

  const unhideCard = useCallback((cardId: string) => {
    storage.unhideCard(cardId);
    triggerRefresh();
  }, [triggerRefresh]);

  const isCardHidden = useCallback(
    (cardId: string) => hiddenCards.some((h) => h.cardId === cardId),
    [hiddenCards]
  );

  return { hiddenCards, hideCard, unhideCard, isCardHidden, isLoading };
}

export function useDashboardViewMode() {
  const {
    value: viewMode,
    triggerRefresh,
    isLoading,
  } = useStorageResource(() => storage.getDashboardViewMode(), 'summary' as DashboardViewMode);
  const setViewMode = useCallback((mode: DashboardViewMode) => {
    storage.setDashboardViewMode(mode);
    triggerRefresh();
  }, [triggerRefresh]);

  return { viewMode, setViewMode, isLoading };
}

export function useSettings() {
  const { value: settings, triggerRefresh, isLoading } = useStorageResource(
    () => storage.getSettings(),
    DEFAULT_SETTINGS
  );
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    storage.updateSettings(newSettings);
    triggerRefresh();
  }, [triggerRefresh]);

  const exportSettings = useCallback(() => {
    return storage.exportSettings();
  }, []);

  const importSettings = useCallback((jsonString: string) => {
    storage.importSettings(jsonString);
    triggerRefresh();
  }, [triggerRefresh]);

  const clearAll = useCallback(() => {
    storage.clearAll();
    triggerRefresh();
  }, [triggerRefresh]);

  return { settings, updateSettings, exportSettings, importSettings, clearAll, isLoading };
}