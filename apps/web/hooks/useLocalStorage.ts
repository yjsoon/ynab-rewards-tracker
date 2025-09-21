import { useState, useEffect, useCallback } from 'react';
import { storage, StorageData, CreditCard, RewardRule, RewardCalculation } from '@/lib/storage';
import { useStorageContext } from '@/contexts/StorageContext';

export function useYnabPAT() {
  const [pat, setPATState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const { refreshTrigger } = useStorageContext();

  useEffect(() => {
    const stored = storage.getPAT();
    setPATState(stored || '');
    setIsLoading(false);
  }, [refreshTrigger]);

  const setPAT = useCallback((newPAT: string) => {
    setPATState(newPAT);
    if (newPAT) {
      storage.setPAT(newPAT);
    } else {
      storage.clearPAT();
    }
  }, []);

  return { pat, setPAT, isLoading };
}

export function useCreditCards() {
  const [cards, setCardsState] = useState<CreditCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { refreshTrigger } = useStorageContext();

  const loadCards = useCallback(() => {
    const stored = storage.getCards();
    setCardsState(stored);
  }, []);

  useEffect(() => {
    loadCards();
    setIsLoading(false);
  }, [loadCards, refreshTrigger]);

  const saveCard = useCallback((card: CreditCard) => {
    storage.saveCard(card);
    loadCards();
  }, [loadCards]);

  const deleteCard = useCallback((cardId: string) => {
    storage.deleteCard(cardId);
    loadCards();
  }, [loadCards]);

  const updateCard = useCallback((card: CreditCard) => {
    storage.saveCard(card);
    loadCards();
  }, [loadCards]);

  return { cards, saveCard, updateCard, deleteCard, isLoading };
}

export function useRewardRules(cardId?: string) {
  const [rules, setRulesState] = useState<RewardRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { refreshTrigger } = useStorageContext();

  const loadRules = useCallback(() => {
    const stored = cardId ? storage.getCardRules(cardId) : storage.getRules();
    setRulesState(stored);
  }, [cardId]);

  useEffect(() => {
    loadRules();
    setIsLoading(false);
  }, [loadRules, refreshTrigger]);

  const saveRule = useCallback((rule: RewardRule) => {
    storage.saveRule(rule);
    loadRules();
  }, [loadRules]);

  const deleteRule = useCallback((ruleId: string) => {
    storage.deleteRule(ruleId);
    loadRules();
  }, [loadRules]);

  return { rules, saveRule, deleteRule, isLoading };
}

export function useRewardCalculations(cardId?: string) {
  const [calculations, setCalculationsState] = useState<RewardCalculation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { refreshTrigger } = useStorageContext();

  const loadCalculations = useCallback(() => {
    const stored = cardId ? storage.getCardCalculations(cardId) : storage.getCalculations();
    setCalculationsState(stored);
  }, [cardId]);

  useEffect(() => {
    loadCalculations();
    setIsLoading(false);
  }, [loadCalculations, refreshTrigger]);

  const saveCalculation = useCallback((calculation: RewardCalculation) => {
    storage.saveCalculation(calculation);
    loadCalculations();
  }, [loadCalculations]);

  const deleteCalculation = useCallback((cardId: string, ruleId: string, period: string) => {
    storage.deleteCalculation(cardId, ruleId, period);
    loadCalculations();
  }, [loadCalculations]);

  const clearCalculations = useCallback(() => {
    storage.clearCalculations();
    loadCalculations();
  }, [loadCalculations]);

  return { calculations, saveCalculation, deleteCalculation, clearCalculations, isLoading };
}

export function useSettings() {
  const [settings, setSettingsState] = useState(storage.getSettings());
  const [isLoading, setIsLoading] = useState(true);
  const { triggerRefresh } = useStorageContext();

  useEffect(() => {
    const loadSettings = () => {
      setSettingsState(storage.getSettings());
      setIsLoading(false);
    };
    loadSettings();
  }, []);

  const updateSettings = useCallback((newSettings: Partial<typeof settings>) => {
    storage.updateSettings(newSettings);
    setSettingsState(storage.getSettings());
    triggerRefresh();
  }, [triggerRefresh]);

  const exportSettings = useCallback(() => {
    return storage.exportSettings();
  }, []);

  const importSettings = useCallback((jsonString: string) => {
    storage.importSettings(jsonString);
    setSettingsState(storage.getSettings());
    // Trigger refresh for all components using storage
    triggerRefresh();
  }, [triggerRefresh]);

  const clearAll = useCallback(() => {
    storage.clearAll();
    setSettingsState(storage.getSettings());
    // Trigger refresh for all components using storage
    triggerRefresh();
  }, [triggerRefresh]);

  return { settings, updateSettings, exportSettings, importSettings, clearAll, isLoading };
}