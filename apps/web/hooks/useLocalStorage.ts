import { useState, useEffect, useCallback } from 'react';
import { storage, StorageData, CreditCard, RewardRule } from '@/lib/storage';

export function useYnabPAT() {
  const [pat, setPATState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = storage.getPAT();
    setPATState(stored || '');
    setIsLoading(false);
  }, []);

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

  const loadCards = useCallback(() => {
    const stored = storage.getCards();
    setCardsState(stored);
  }, []);

  useEffect(() => {
    loadCards();
    setIsLoading(false);
  }, [loadCards]);

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

  const loadRules = useCallback(() => {
    const stored = cardId ? storage.getCardRules(cardId) : storage.getRules();
    setRulesState(stored);
  }, [cardId]);

  useEffect(() => {
    loadRules();
    setIsLoading(false);
  }, [loadRules]);

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

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const exportSettings = useCallback(() => {
    return storage.exportSettings();
  }, []);

  const importSettings = useCallback((jsonString: string) => {
    storage.importSettings(jsonString);
    // Reload the page to refresh all components
    window.location.reload();
  }, []);

  const clearAll = useCallback(() => {
    if (confirm('This will delete all your settings and data. Are you sure?')) {
      storage.clearAll();
      window.location.reload();
    }
  }, []);

  return { exportSettings, importSettings, clearAll, isLoading };
}