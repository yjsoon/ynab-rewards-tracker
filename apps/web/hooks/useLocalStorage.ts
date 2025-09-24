import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CreditCard, RewardRule, RewardCalculation, AppSettings } from '@/lib/storage';
import { storage } from '@/lib/storage';
import { useStorageContext } from '@/contexts/StorageContext';

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
    void refreshTrigger;
    return storage.getPAT() || '';
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
      return [] as CreditCard[];
    }
    void refreshTrigger;
    return storage.getCards();
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

export function useRewardRules(cardId?: string) {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const rules = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return [] as RewardRule[];
    }
    void refreshTrigger;
    return cardId ? storage.getCardRules(cardId) : storage.getRules();
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
      return [] as RewardCalculation[];
    }
    void refreshTrigger;
    return cardId ? storage.getCardCalculations(cardId) : storage.getCalculations();
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

export function useSettings() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();
  const hasHydrated = useHasHydrated();

  const settings = useMemo(() => {
    if (!hasHydrated || typeof window === 'undefined') {
      return { theme: 'light', currency: 'USD' } satisfies AppSettings;
    }
    void refreshTrigger;
    return storage.getSettings();
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