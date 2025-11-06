import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { normalizePeriod, storage } from '@/storage/service';
import { ynabSync } from '@/lib/sync';
import { fetchBudgets } from '@/lib/ynab-api';
import { SimpleRewardsCalculator } from '@ynab-counter/app-core/rewards-engine';
import { createRewardCalculationFromSimple } from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';
import type {
  AppSettings,
  CreditCard,
  RewardRule,
  TagMapping,
  RewardCalculation,
  ThemeGroup,
  HiddenCard,
  StorageData,
  DashboardTransactionsCachePayload,
  DashboardTransactionsCacheEntry,
  Transaction,
} from '@ynab-counter/app-core/storage';
import type {
  YnabAccountSummary,
  YnabBudgetSummary,
  YnabTransactionSummary,
} from '@/lib/ynab-client';

type ConnectionStatus = 'disconnected' | 'authenticating' | 'awaiting_budget' | 'connected' | 'error';

type SelectedBudget = { id?: string; name?: string };

type PendingConnectionChanges = {
  budget?: { id: string; name: string };
  trackedAccountIds?: string[];
};

type StorageStatus = {
  isHydrated: boolean;
  isRefreshing: boolean;
  error?: Error;
};

type Metadata = {
  lastAttemptedSync?: string;
  lastSuccessfulSync?: string;
  accountsBudgetId?: string;
};

type StorageState = {
  pat?: string;
  connectionStatus: ConnectionStatus;
  isSyncing: boolean;
  connectionError?: string;
  selectedBudget: SelectedBudget;
  trackedAccountIds: string[];
  pending?: PendingConnectionChanges;
  hasPendingChanges: boolean;
  cards: CreditCard[];
  rules: RewardRule[];
  tagMappings: TagMapping[];
  calculations: RewardCalculation[];
  themeGroups: ThemeGroup[];
  hiddenCards: HiddenCard[];
  settings: AppSettings;
  cachedData?: StorageData['cachedData'];
  budgets: YnabBudgetSummary[];
  accounts: YnabAccountSummary[];
  metadata: Metadata;
};

type SyncOptions = {
  sinceDate?: string;
  skipTransactions?: boolean;
};

type StorageActions = {
  refresh: () => Promise<void>;
  setPAT: (pat: string) => Promise<void>;
  clearPAT: () => Promise<void>;
  disconnect: () => Promise<void>;
  setSelectedBudget: (budgetId: string, budgetName: string) => Promise<void>;
  setTrackedAccountIds: (accountIds: string[]) => Promise<void>;
  syncBudgetsAndAccounts: (options?: SyncOptions) => Promise<void>;
  stageBudgetSelection: (budgetId: string, budgetName: string) => void;
  stageTrackedAccountIds: (ids: string[]) => void;
  applyPendingChanges: () => Promise<void>;
  clearPendingChanges: () => void;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setCards: (cards: CreditCard[]) => Promise<void>;
  setRules: (rules: RewardRule[]) => Promise<void>;
  setTagMappings: (mappings: TagMapping[]) => Promise<void>;
  setCalculations: (calculations: RewardCalculation[]) => Promise<void>;
  setThemeGroups: (groups: ThemeGroup[]) => Promise<void>;
  setHiddenCards: (hiddenCards: HiddenCard[]) => Promise<void>;
  setDashboardCachedData: (payload: DashboardTransactionsCachePayload) => Promise<void>;
  pruneDashboardCache: (ttlMs?: number) => Promise<void>;
};

type StorageContextValue = {
  status: StorageStatus;
  state: StorageState;
  actions: StorageActions;
};

const STORAGE_REFRESH_ERROR = 'Failed to refresh storage';
const LOAD_ERROR_MESSAGE = 'Failed to load storage';
const AUTO_CREATED_CARD_ISSUER = 'Unknown';

/**
 * Calculate the earliest period start date across all cards to ensure
 * we fetch all necessary transactions for cards with non-calendar billing cycles
 */
function getEarliestPeriodStart(cards: CreditCard[]): string {
  const now = new Date();
  let earliestStart = new Date(now.getFullYear(), now.getMonth(), 1);

  cards.forEach(card => {
    const period = SimpleRewardsCalculator.calculatePeriod(card);
    const periodStart = new Date(period.start);
    if (periodStart < earliestStart) {
      earliestStart = periodStart;
    }
  });

  return earliestStart.toISOString().split('T')[0];
}

const defaultState: StorageState = {
  connectionStatus: 'disconnected',
  isSyncing: false,
  selectedBudget: {},
  trackedAccountIds: [],
  pending: undefined,
  hasPendingChanges: false,
  cards: [],
  rules: [],
  tagMappings: [],
  calculations: [],
  themeGroups: [],
  hiddenCards: [],
  settings: {},
  cachedData: undefined,
  budgets: [],
  accounts: [],
  metadata: {},
};

const defaultStatus: StorageStatus = {
  isHydrated: false,
  isRefreshing: false,
};

const noopActions: StorageActions = {
  refresh: async () => {},
  setPAT: async () => {},
  clearPAT: async () => {},
  disconnect: async () => {},
  setSelectedBudget: async () => {},
  setTrackedAccountIds: async () => {},
  syncBudgetsAndAccounts: async () => {},
  stageBudgetSelection: () => {},
  stageTrackedAccountIds: () => {},
  applyPendingChanges: async () => {},
  clearPendingChanges: () => {},
  setSettings: async () => {},
  setCards: async () => {},
  setRules: async () => {},
  setTagMappings: async () => {},
  setCalculations: async () => {},
  setThemeGroups: async () => {},
  setHiddenCards: async () => {},
  setDashboardCachedData: async () => {},
  pruneDashboardCache: async () => {},
};

const StorageContext = createContext<StorageContextValue>({
  status: defaultStatus,
  state: defaultState,
  actions: noopActions,
});

async function hydrate(): Promise<StorageState> {
  const [
    pat,
    selectedBudget,
    trackedAccountIds,
    cards,
    rules,
    tagMappings,
    calculations,
    themeGroups,
    hiddenCards,
    settings,
    cachedData,
  ] = await Promise.all([
    storage.getPAT(),
    storage.getSelectedBudget(),
    storage.getTrackedAccountIds(),
    storage.getCards(),
    storage.getRules(),
    storage.getTagMappings(),
    storage.getCalculations(),
    storage.getThemeGroups(),
    storage.getHiddenCards(),
    storage.getSettings(),
    storage.getCachedData(),
  ]);

  let connectionStatus: ConnectionStatus;
  if (!pat) {
    connectionStatus = 'disconnected';
  } else if (!selectedBudget.id) {
    connectionStatus = 'awaiting_budget';
  } else {
    connectionStatus = 'connected';
  }

  return {
    pat: pat ?? undefined,
    connectionStatus,
    isSyncing: false,
    selectedBudget,
    trackedAccountIds,
    pending: undefined,
    hasPendingChanges: false,
    cards,
    rules,
    tagMappings,
    calculations,
    themeGroups,
    hiddenCards,
    settings,
    cachedData,
    budgets: [],
    accounts: [],
    metadata: {},
  };
}

function mergeDashboardCache(
  existing: StorageData['cachedData'] | undefined,
  payload: DashboardTransactionsCachePayload,
): StorageData['cachedData'] {
  const entry: DashboardTransactionsCacheEntry = {
    budgetId: payload.budgetId,
    sinceDate: payload.sinceDate,
    fetchedAt: payload.fetchedAt,
    trackedAccountIds: [...payload.trackedAccountIds],
    transactions: payload.transactions.map((txn) => ({
      id: txn.id,
      date: txn.date,
      amount: txn.amount,
      account_id: txn.account_id,
      payee_name: txn.payee_name ?? null,
      category_name: txn.category_name ?? null,
      memo: txn.memo ?? null,
      cleared: txn.cleared ?? null,
      approved: txn.approved ?? false,
      flag_color: txn.flag_color ?? null,
      flag_name: txn.flag_name ?? null,
    })),
    accounts: payload.accounts,
  };

  const existingEntries = existing?.dashboardTransactions ?? [];
  const incomingKey = `${entry.budgetId}::${entry.sinceDate}::${entry.trackedAccountIds.join(',')}`;
  const filtered = existingEntries.filter((candidate) => {
    const candidateKey = `${candidate.budgetId}::${candidate.sinceDate}::${candidate.trackedAccountIds.join(',')}`;
    return candidateKey !== incomingKey;
  });

  filtered.unshift(entry);

  return {
    ...(existing ?? {}),
    dashboardTransactions: filtered,
  };
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StorageState>(defaultState);
  const [status, setStatus] = useState<StorageStatus>(defaultStatus);

  const performSync = useCallback(
    async (
      options: SyncOptions = {},
      overrides: Partial<{ pat: string; selectedBudgetId?: string; trackedAccountIds: string[] }> = {},
    ) => {
      const pat = overrides.pat ?? state.pat;
      const selectedBudgetId = overrides.selectedBudgetId ?? state.selectedBudget.id;
      const trackedAccountIds = overrides.trackedAccountIds ?? state.trackedAccountIds;

      if (!pat) {
        console.log('[StorageContext] performSync: no PAT available, skipping sync');
        setState((prev) => ({
          ...prev,
          connectionStatus: 'disconnected',
          isSyncing: false,
          connectionError: undefined,
        }));
        return;
      }

      if (!selectedBudgetId) {
        console.log('[StorageContext] performSync: no budget selected, setting awaiting_budget');
        setState((prev) => ({
          ...prev,
          connectionStatus: 'awaiting_budget',
          isSyncing: false,
          connectionError: undefined,
        }));
        return;
      }

      console.log('[StorageContext] performSync: begin', {
        selectedBudgetId,
        trackedCount: trackedAccountIds.length,
        sinceDate: options.sinceDate,
      });

      setState((prev) => ({
        ...prev,
        isSyncing: true,
        connectionError: undefined,
        metadata: {
          ...prev.metadata,
          lastAttemptedSync: new Date().toISOString(),
        },
      }));

      try {
        const result = await ynabSync.syncBudgetsAndAccounts({
          pat,
          selectedBudgetId,
          trackedAccountIds,
          sinceDate: options.sinceDate,
          skipTransactions: options.skipTransactions,
        });

        let nextSelectedBudget: SelectedBudget = state.selectedBudget;
        if (result.budgetId && result.budgetId !== selectedBudgetId) {
          const matched = result.budgets.find((budget) => budget.id === result.budgetId);
          if (matched) {
            await storage.setSelectedBudget(matched.id, matched.name);
            nextSelectedBudget = { id: matched.id, name: matched.name };
          } else {
            nextSelectedBudget = { id: result.budgetId };
          }
        } else if (selectedBudgetId) {
          const matched = result.budgets.find((budget) => budget.id === selectedBudgetId);
          if (matched) {
            nextSelectedBudget = { id: matched.id, name: matched.name };
          }
        }

        let nextCachedData = state.cachedData;
        const effectiveBudgetId = nextSelectedBudget.id;
        let transactionsPayload: Transaction[] = [];
        if (effectiveBudgetId) {
          transactionsPayload = result.transactions.map((txn) => ({
            id: txn.id,
            date: txn.date,
            amount: txn.amount,
            account_id: txn.account_id,
            payee_name: txn.payee_name ?? null,
            category_name: txn.category_name ?? null,
            memo: txn.memo ?? null,
            cleared: txn.cleared ?? null,
            approved: txn.approved ?? false,
            flag_color: txn.flag_color ?? null,
            flag_name: txn.flag_name ?? null,
          })) as Transaction[];

          const payload: DashboardTransactionsCachePayload = {
            budgetId: effectiveBudgetId,
            sinceDate: options.sinceDate ?? new Date().toISOString().split('T')[0],
            fetchedAt: new Date().toISOString(),
            trackedAccountIds,
            transactions: transactionsPayload,
            accounts: result.accounts.map((account) => ({ id: account.id, name: account.name })),
          };

          await storage.setDashboardTransactionsCache(payload);
          nextCachedData = mergeDashboardCache(state.cachedData, payload);
        } else {
          transactionsPayload = result.transactions.map((txn) => ({
            id: txn.id,
            date: txn.date,
            amount: txn.amount,
            account_id: txn.account_id,
            payee_name: txn.payee_name ?? null,
            category_name: txn.category_name ?? null,
            memo: txn.memo ?? null,
            cleared: txn.cleared ?? null,
            approved: txn.approved ?? false,
            flag_color: txn.flag_color ?? null,
            flag_name: txn.flag_name ?? null,
          })) as Transaction[];
        }

        // Only recalculate rewards if transactions were actually fetched
        // When skipTransactions is true, preserve existing calculations instead of overwriting with zeros
        const calculatedRewards = options.skipTransactions ? [] : state.cards.map((card) => {
          if (!card.ynabAccountId) {
            return null;
          }
          const period = SimpleRewardsCalculator.calculatePeriod(card);
          const cardTransactions = transactionsPayload.filter((txn) => txn.account_id === card.ynabAccountId);
          const calculation = SimpleRewardsCalculator.calculateCardRewards(card, cardTransactions, period, state.settings);
          return createRewardCalculationFromSimple(card, calculation);
        }).filter((value): value is RewardCalculation => Boolean(value));

        if (calculatedRewards.length > 0) {
          await Promise.all(calculatedRewards.map((entry) => storage.saveCalculation(entry)));
        }

        const mergedCalculations = (() => {
          if (calculatedRewards.length === 0) {
            return state.calculations;
          }
          const replacementKeys = new Set(calculatedRewards.map((entry) => `${entry.cardId}::${entry.period}`));
          const preserved = state.calculations.filter((entry) => !replacementKeys.has(`${entry.cardId}::${entry.period}`));
          return [...preserved, ...calculatedRewards];
        })();

        // Auto-create cards from tracked accounts (similar to web app)
        const cardsByAccountId = new Map(
          state.cards.filter((c): c is CreditCard & { ynabAccountId: string } => Boolean(c.ynabAccountId))
            .map((card) => [card.ynabAccountId, card] as const)
        );

        const newCards: CreditCard[] = [];
        trackedAccountIds.forEach((accountId) => {
          if (!cardsByAccountId.has(accountId)) {
            const account = result.accounts.find((acc) => acc.id === accountId);
            if (account) {
              const newCard: CreditCard = {
                id: `ynab-${accountId}`,
                name: account.name,
                issuer: AUTO_CREATED_CARD_ISSUER,
                type: 'cashback',
                featured: true,
                ynabAccountId: accountId,
                billingCycle: {
                  type: 'calendar',
                  dayOfMonth: 1,
                },
                earningRate: 1,
                earningBlockSize: null,
                minimumSpend: null,
                maximumSpend: null,
                subcategoriesEnabled: false,
                subcategories: [],
              };
              newCards.push(newCard);
            }
          }
        });

        if (newCards.length > 0) {
          await Promise.all(newCards.map((card) => storage.saveCard(card)));
          console.log('[StorageContext] performSync: created cards from accounts', {
            count: newCards.length,
            cards: newCards.map((c) => ({ id: c.id, name: c.name })),
          });
        }

        // Reload cards after potential creation
        const updatedCards = await storage.getCards();

        setState((prev) => ({
          ...prev,
          pat,
          budgets: result.budgets,
          accounts: result.accounts,
          selectedBudget: nextSelectedBudget,
          cachedData: nextCachedData,
          calculations: mergedCalculations,
          cards: updatedCards,
          connectionStatus: effectiveBudgetId ? 'connected' : 'awaiting_budget',
          isSyncing: false,
          connectionError: undefined,
          pending: undefined,
          hasPendingChanges: false,
          metadata: {
            ...prev.metadata,
            lastSuccessfulSync: new Date().toISOString(),
            accountsBudgetId: effectiveBudgetId,
          },
        }));
        console.log('[StorageContext] performSync: success', {
          budgetId: nextSelectedBudget.id,
          budgets: result.budgets.length,
          accounts: result.accounts.length,
          transactions: result.transactions.length,
        });
      } catch (error) {
        const isAbortError =
          error instanceof Error &&
          (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));

        if (isAbortError) {
          console.log('[StorageContext] performSync: aborted (user cancelled)', error);
          setState((prev) => ({
            ...prev,
            connectionStatus: pat ? prev.connectionStatus : 'disconnected',
            isSyncing: false,
            connectionError: undefined,
          }));
          setStatus((prev) => ({
            ...prev,
            error: undefined,
          }));
          return;
        }

        // Non-abort errors: preserve existing behavior
        const message = error instanceof Error ? error.message : 'Failed to sync with YNAB';
        setState((prev) => ({
          ...prev,
          connectionStatus: 'error',
          isSyncing: false,
          connectionError: message,
        }));
        setStatus((prev) => ({
          ...prev,
          error: error instanceof Error ? error : new Error(message),
        }));
        const failure = error instanceof Error ? error : new Error(message);
        console.error('[StorageContext] performSync: failed', failure);
        throw failure;
      }
    },
    [state.cachedData, state.pat, state.selectedBudget, state.trackedAccountIds, state.cards, state.calculations, state.settings],
  );

  const initialiseConnection = useCallback(
    async (pat: string, trackedAccountIds: string[], selectedBudgetId?: string) => {
      if (!pat) {
        console.log('[StorageContext] initialiseConnection: skipped (no PAT)');
        setState((prev) => ({
          ...prev,
          connectionStatus: 'disconnected',
          isSyncing: false,
          connectionError: undefined,
        }));
        return;
      }

      console.log('[StorageContext] initialiseConnection: begin', {
        hasSelectedBudget: Boolean(selectedBudgetId),
        trackedCount: trackedAccountIds.length,
      });
      setState((prev) => ({
        ...prev,
        pat,
        connectionStatus: 'authenticating',
        isSyncing: false,
        connectionError: undefined,
      }));

      try {
        const budgets = await fetchBudgets(pat);
        let nextBudget = selectedBudgetId ? budgets.find((budget) => budget.id === selectedBudgetId) : undefined;

        if (!nextBudget && budgets.length === 1) {
          nextBudget = budgets[0];
          await storage.setSelectedBudget(nextBudget.id, nextBudget.name);
        }

        if (!nextBudget) {
          setState((prev) => ({
            ...prev,
            pat,
            budgets,
            selectedBudget: {},
            accounts: [],
            connectionStatus: 'awaiting_budget',
            connectionError: undefined,
          }));
          console.log('[StorageContext] initialiseConnection: waiting for budget selection');
          return;
        }

        setState((prev) => ({
          ...prev,
          pat,
          budgets,
          selectedBudget: { id: nextBudget.id, name: nextBudget.name },
          connectionStatus: 'authenticating',
          connectionError: undefined,
        }));

        await performSync({ skipTransactions: true }, {
          pat,
          selectedBudgetId: nextBudget.id,
          trackedAccountIds,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to connect to YNAB';
        console.error('[StorageContext] initialiseConnection: failed', error);
        setState((prev) => ({
          ...prev,
          pat: undefined,
          connectionStatus: 'error',
          isSyncing: false,
          connectionError: message,
          selectedBudget: {},
          budgets: [],
          accounts: [],
        }));
        await storage.clearPAT();
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [performSync],
  );

  const initialiseConnectionRef = useRef(initialiseConnection);
  useEffect(() => {
    initialiseConnectionRef.current = initialiseConnection;
  }, [initialiseConnection]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const hydrated = await hydrate();
        if (cancelled) {
          return;
        }

        setState(hydrated);
        setStatus({ isHydrated: true, isRefreshing: false });

        if (hydrated.pat) {
          await initialiseConnectionRef.current(
            hydrated.pat,
            hydrated.trackedAccountIds,
            hydrated.selectedBudget.id,
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus({
          isHydrated: true,
          isRefreshing: false,
          error: error instanceof Error ? error : new Error(LOAD_ERROR_MESSAGE),
        });
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
      setStatus((prev) => ({ ...prev, isRefreshing: true, error: undefined }));
    try {
      const next = await hydrate();
      setState((prev) => ({
        ...next,
        metadata: prev.metadata,
        budgets: prev.budgets,
        accounts: prev.accounts,
      }));
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error : new Error(STORAGE_REFRESH_ERROR),
      }));
    } finally {
      setStatus((prev) => ({ ...prev, isRefreshing: false }));
    }
  }, []);

  const actions = useMemo<StorageActions>(
    () => ({
      refresh,
      setPAT: async (pat: string) => {
        const trimmed = pat.trim();
        console.log('[StorageContext] setPAT: received PAT update');
        await storage.setPAT(trimmed);
        const storedSelection = await storage.getSelectedBudget();
        console.log('[StorageContext] setPAT: stored selection', storedSelection);
        await initialiseConnection(trimmed, state.trackedAccountIds, storedSelection.id);
      },
      clearPAT: async () => {
        await storage.clearPAT();
        setState((prev) => ({
          ...prev,
          pat: undefined,
          connectionStatus: 'disconnected',
          isSyncing: false,
          connectionError: undefined,
          selectedBudget: {},
          trackedAccountIds: [],
          pending: undefined,
          hasPendingChanges: false,
          budgets: [],
          accounts: [],
          cachedData: undefined,
          metadata: {},
        }));
      },
      disconnect: async () => {
        await storage.resetConnectionState();
        setState((prev) => ({
          ...prev,
          connectionStatus: 'disconnected',
          isSyncing: false,
          connectionError: undefined,
          selectedBudget: {},
          trackedAccountIds: [],
          pending: undefined,
          hasPendingChanges: false,
          budgets: [],
          accounts: [],
          cachedData: undefined,
          metadata: {},
        }));
      },
      setSelectedBudget: async (budgetId: string, budgetName: string) => {
        await storage.setSelectedBudget(budgetId, budgetName);
        setState((prev) => ({
          ...prev,
          selectedBudget: { id: budgetId, name: budgetName },
          connectionError: undefined,
        }));
      },
      setTrackedAccountIds: async (accountIds: string[]) => {
        await storage.setTrackedAccountIds(accountIds);
        setState((prev) => ({
          ...prev,
          trackedAccountIds: [...accountIds],
        }));
      },
      syncBudgetsAndAccounts: async (options) => {
        await performSync(options ?? {});
      },
      stageBudgetSelection: (budgetId: string, budgetName: string) => {
        setState((prev) => {
          const matchesSelected = prev.selectedBudget.id === budgetId;
          const nextPendingBudget = matchesSelected ? undefined : { id: budgetId, name: budgetName };
          const nextPendingTracked = prev.pending?.trackedAccountIds;

          const hasChanges = Boolean(nextPendingBudget || nextPendingTracked);

          return {
            ...prev,
            pending: hasChanges ? {
              budget: nextPendingBudget,
              trackedAccountIds: nextPendingTracked,
            } : undefined,
            hasPendingChanges: hasChanges,
          };
        });
      },
      stageTrackedAccountIds: (ids: string[]) => {
        const unique = Array.from(new Set(ids));
        unique.sort();
        setState((prev) => {
          const prevIds = [...prev.trackedAccountIds].sort();
          const matchesState = unique.length === prevIds.length && unique.every((id, idx) => id === prevIds[idx]);
          const nextPendingTracked = matchesState ? undefined : unique;
          const nextPendingBudget = prev.pending?.budget;

          const hasChanges = Boolean(nextPendingBudget || nextPendingTracked);

          return {
            ...prev,
            pending: hasChanges ? {
              budget: nextPendingBudget,
              trackedAccountIds: nextPendingTracked,
            } : undefined,
            hasPendingChanges: hasChanges,
          };
        });
      },
      applyPendingChanges: async () => {
        const pat = state.pat;
        if (!pat) {
          setState((prev) => ({
            ...prev,
            connectionStatus: 'disconnected',
            pending: undefined,
            hasPendingChanges: false,
          }));
          return;
        }
        const pending = state.pending;
        if (!pending || (!pending.budget && !pending.trackedAccountIds)) {
          return;
        }

        const nextBudget = pending.budget ?? state.selectedBudget;
        const nextTrackedIds = pending.trackedAccountIds ?? state.trackedAccountIds;
        const wasSetupMode = !state.selectedBudget.id || state.trackedAccountIds.length === 0;

        if (pending.budget && nextBudget.id && nextBudget.name) {
          await storage.setSelectedBudget(nextBudget.id, nextBudget.name);
        }
        if (pending.trackedAccountIds) {
          await storage.setTrackedAccountIds(nextTrackedIds);
        }

        setState((prev) => ({
          ...prev,
          selectedBudget: nextBudget.id ? nextBudget : prev.selectedBudget,
          trackedAccountIds: pending.trackedAccountIds ? nextTrackedIds : prev.trackedAccountIds,
          pending: undefined,
          hasPendingChanges: false,
        }));

        // Initial sync skips transactions for speed
        await performSync({ skipTransactions: true }, {
          pat,
          selectedBudgetId: nextBudget.id,
          trackedAccountIds: nextTrackedIds,
        });

        // If setup just completed, fetch transactions now
        if (wasSetupMode && nextBudget.id && nextTrackedIds.length > 0) {
          console.log('[StorageContext] applyPendingChanges: setup completed, fetching transactions');
          // Get the newly created cards to calculate earliest period start
          const cards = await storage.getCards();
          await performSync({ skipTransactions: false, sinceDate: getEarliestPeriodStart(cards) }, {
            pat,
            selectedBudgetId: nextBudget.id,
            trackedAccountIds: nextTrackedIds,
          });
        }
      },
      clearPendingChanges: () => {
        setState((prev) => ({
          ...prev,
          pending: undefined,
          hasPendingChanges: false,
        }));
      },
      setSettings: async (settings) => {
        await storage.updateSettings(settings);
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...settings,
          },
        }));
      },
      setCards: async (cards) => {
        await Promise.all(cards.map((card) => storage.saveCard(card)));
        setState((prev) => ({
          ...prev,
          cards,
        }));
      },
      setRules: async (rules) => {
        await Promise.all(rules.map((rule) => storage.saveRule(rule)));
        setState((prev) => ({
          ...prev,
          rules,
        }));
      },
      setTagMappings: async (mappings) => {
        await Promise.all(mappings.map((mapping) => storage.saveTagMapping(mapping)));
        setState((prev) => ({
          ...prev,
          tagMappings: mappings,
        }));
      },
      setCalculations: async (calculations) => {
        await Promise.all(calculations.map((calculation) => storage.saveCalculation(calculation)));
        setState((prev) => ({
          ...prev,
          calculations,
        }));
      },
      setThemeGroups: async (groups) => {
        await Promise.all(groups.map((group) => storage.saveThemeGroup(group)));
        setState((prev) => ({
          ...prev,
          themeGroups: groups,
        }));
      },
      setHiddenCards: async (hiddenCards) => {
        await Promise.all(hiddenCards.map((entry) => storage.hideCard(entry.cardId, entry.hiddenUntil, entry.reason)));
        setState((prev) => ({
          ...prev,
          hiddenCards,
        }));
      },
      setDashboardCachedData: async (payload) => {
        await storage.setDashboardTransactionsCache(payload);
        setState((prev) => ({
          ...prev,
          cachedData: mergeDashboardCache(prev.cachedData, payload),
        }));
      },
      pruneDashboardCache: async (ttlMs) => {
        await storage.pruneDashboardTransactionsCache(ttlMs);
        const refreshed = await storage.getCachedData();
        setState((prev) => ({
          ...prev,
          cachedData: refreshed,
        }));
      },
    }),
    [initialiseConnection, performSync, refresh, state.trackedAccountIds, state.pat, state.pending, state.selectedBudget],
  );

  const value = useMemo<StorageContextValue>(
    () => ({
      status,
      state,
      actions,
    }),
    [actions, state, status],
  );

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageContextValue {
  return useContext(StorageContext);
}
