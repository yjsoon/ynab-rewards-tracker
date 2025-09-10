import { useState, useEffect, useCallback } from 'react';
import { storage, StorageData, CreditCard, RewardRule } from '@/lib/storage';
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

  return { cards, saveCard, deleteCard, isLoading };
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

export function useSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const { triggerRefresh } = useStorageContext();

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const exportSettings = useCallback(() => {
    return storage.exportSettings();
  }, []);

  const importSettings = useCallback((jsonString: string) => {
    storage.importSettings(jsonString);
    // Trigger refresh for all components using storage
    triggerRefresh();
  }, [triggerRefresh]);

  const clearAll = useCallback(() => {
    storage.clearAll();
    // Trigger refresh for all components using storage
    triggerRefresh();
  }, [triggerRefresh]);

  return { exportSettings, importSettings, clearAll, isLoading };
}