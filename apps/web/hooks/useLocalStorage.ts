import { useCallback, useMemo } from 'react';
import type { CreditCard, RewardRule, RewardCalculation, AppSettings } from '@/lib/storage';
import { storage } from '@/lib/storage';
import { useStorageContext } from '@/contexts/StorageContext';

export function useYnabPAT() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();

  const pat = useMemo(() => {
    void refreshTrigger;
    return storage.getPAT() || '';
  }, [refreshTrigger]);

  const setPAT = useCallback((newPAT: string) => {
    if (newPAT) {
      storage.setPAT(newPAT);
    } else {
      storage.clearPAT();
    }
    triggerRefresh();
  }, [triggerRefresh]);

  return { pat, setPAT, isLoading: false };
}

export function useCreditCards() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();

  const cards = useMemo(() => {
    void refreshTrigger;
    return storage.getCards();
  }, [refreshTrigger]);

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

  return { cards, saveCard, updateCard, deleteCard, isLoading: false };
}

export function useRewardRules(cardId?: string) {
  const { refreshTrigger, triggerRefresh } = useStorageContext();

  const rules = useMemo(() => {
    void refreshTrigger;
    return cardId ? storage.getCardRules(cardId) : storage.getRules();
  }, [cardId, refreshTrigger]);

  const saveRule = useCallback((rule: RewardRule) => {
    storage.saveRule(rule);
    triggerRefresh();
  }, [triggerRefresh]);

  const deleteRule = useCallback((ruleId: string) => {
    storage.deleteRule(ruleId);
    triggerRefresh();
  }, [triggerRefresh]);

  return { rules, saveRule, deleteRule, isLoading: false };
}

export function useRewardCalculations(cardId?: string) {
  const { refreshTrigger, triggerRefresh } = useStorageContext();

  const calculations = useMemo(() => {
    void refreshTrigger;
    return cardId ? storage.getCardCalculations(cardId) : storage.getCalculations();
  }, [cardId, refreshTrigger]);

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

  return { calculations, saveCalculation, deleteCalculation, clearCalculations, isLoading: false };
}

export function useSettings() {
  const { refreshTrigger, triggerRefresh } = useStorageContext();

  const settings = useMemo(() => {
    void refreshTrigger;
    return storage.getSettings();
  }, [refreshTrigger]);

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

  return { settings, updateSettings, exportSettings, importSettings, clearAll, isLoading: false };
}