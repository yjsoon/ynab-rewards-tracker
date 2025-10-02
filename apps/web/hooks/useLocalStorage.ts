import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function useYnabPAT() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const pat = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return '';
    }
    // Force re-computation when refreshTrigger changes
    return storage.getPAT() || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

  const setPAT = useCallback((newPAT: string) => {
    if (newPAT) {
      storage.setPAT(newPAT);
    } else {
      storage.clearPAT();
    }
    triggerRefresh();
  }, [triggerRefresh]);

  return { pat, setPAT, isLoading: !hasHydrated };
}

export function useCreditCards() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const cards = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_CARD_LIST;
    }
    // Force re-computation when refreshTrigger changes
    return storage.getCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

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

  return { cards, saveCard, updateCard, deleteCard, isLoading: !hasHydrated };
}

export function useSelectedBudget() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const selectedBudget = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_SELECTED_BUDGET;
    }
    // Force re-computation when refreshTrigger changes
    return storage.getSelectedBudget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

  const setSelectedBudget = useCallback((budgetId: string, budgetName: string) => {
    storage.setSelectedBudget(budgetId, budgetName);
    triggerRefresh();
  }, [triggerRefresh]);

  return { selectedBudget, setSelectedBudget, isLoading: !hasHydrated };
}

export function useTrackedAccountIds() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const trackedAccountIds = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_STRING_ARRAY;
    }
    // Force re-computation when refreshTrigger changes
    return storage.getTrackedAccountIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

  const setTrackedAccountIds = useCallback((accountIds: string[]) => {
    storage.setTrackedAccountIds(accountIds);
    triggerRefresh();
  }, [triggerRefresh]);

  const isAccountTracked = useCallback(
    (accountId: string) => trackedAccountIds.includes(accountId),
    [trackedAccountIds]
  );

  return { trackedAccountIds, setTrackedAccountIds, isAccountTracked, isLoading: !hasHydrated };
}

export function useRewardRules(cardId?: string) {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const rules = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_RULE_LIST;
    }
    // Force re-computation when refreshTrigger changes
    return cardId ? storage.getCardRules(cardId) : storage.getRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, hasHydrated, refreshTrigger]);

  const saveRule = useCallback((rule: RewardRule) => {
    storage.saveRule(rule);
    triggerRefresh();
  }, [triggerRefresh]);

  const deleteRule = useCallback((ruleId: string) => {
    storage.deleteRule(ruleId);
    triggerRefresh();
  }, [triggerRefresh]);

  return { rules, saveRule, deleteRule, isLoading: !hasHydrated };
}

export function useRewardCalculations(cardId?: string) {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const calculations = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_CALCULATION_LIST;
    }
    // Force re-computation when refreshTrigger changes
    return cardId ? storage.getCardCalculations(cardId) : storage.getCalculations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, hasHydrated, refreshTrigger]);

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

  return { calculations, saveCalculation, deleteCalculation, clearCalculations, isLoading: !hasHydrated };
}

export function useThemeGroups() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const themeGroups = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_THEME_GROUP_LIST;
    }
    return storage.getThemeGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

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
    isLoading: !hasHydrated,
  };
}

export function useHiddenCards() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const hiddenCards = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return EMPTY_HIDDEN_CARD_LIST;
    }
    // Clean expired entries and return active ones
    return storage.cleanExpiredHiddenCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

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

  return { hiddenCards, hideCard, unhideCard, isCardHidden, isLoading: !hasHydrated };
}

export function useDashboardViewMode() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const viewMode = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return 'summary' as DashboardViewMode;
    }
    // Force re-computation when refreshTrigger changes
    return storage.getDashboardViewMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

  const setViewMode = useCallback((mode: DashboardViewMode) => {
    storage.setDashboardViewMode(mode);
    triggerRefresh();
  }, [triggerRefresh]);

  return { viewMode, setViewMode, isLoading: !hasHydrated };
}

export function useSettings() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const settings = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return DEFAULT_SETTINGS;
    }
    // Force re-computation when refreshTrigger changes
    return storage.getSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, refreshTrigger]);

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

  return { settings, updateSettings, exportSettings, importSettings, clearAll, isLoading: !hasHydrated };
}