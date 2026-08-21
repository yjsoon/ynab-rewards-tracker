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
import { storage } from '@/storage/service';
import { ynabSync } from '@/lib/sync';
import { fetchBudgets } from '@/lib/ynab-api';
import { isYnabApiError } from '@/lib/ynab-client';
import { createDemoStorageFixture } from '@/lib/demo-data';
import { runSetupSyncChain } from './setup-sync-chain';
import { retryExpectedStorageCancellation } from './storage-cancellation';
import { SimpleRewardsCalculator } from '@ynab-counter/app-core/rewards-engine';
import {
  createRewardCalculationFromSimple,
  revalueRewardCalculations,
} from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import {
  formatCalculationPeriod,
  mergeRewardCalculations,
} from '@ynab-counter/app-core/storage';
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
  refreshError?: Error;
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
  refresh: (expectedGeneration?: number) => Promise<void>;
  invalidatePendingOperations: () => number;
  invalidateSyncRequests: () => void;
  setPAT: (pat: string) => Promise<boolean>;
  clearPAT: () => Promise<void>;
  disconnect: () => Promise<void>;
  setSelectedBudget: (budgetId: string, budgetName: string) => Promise<void>;
  setTrackedAccountIds: (accountIds: string[]) => Promise<void>;
  syncBudgetsAndAccounts: (options?: SyncOptions, expectedGeneration?: number) => Promise<void>;
  stageBudgetSelection: (budgetId: string, budgetName: string) => void;
  stageTrackedAccountIds: (ids: string[]) => void;
  applyPendingChanges: () => Promise<boolean>;
  clearPendingChanges: () => void;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setCards: (cards: CreditCard[]) => Promise<void>;
  setRules: (rules: RewardRule[]) => Promise<void>;
  setTagMappings: (mappings: TagMapping[]) => Promise<void>;
  setCalculations: (calculations: RewardCalculation[]) => Promise<void>;
  setThemeGroups: (groups: ThemeGroup[]) => Promise<void>;
  setHiddenCards: (hiddenCards: HiddenCard[]) => Promise<void>;
  setDashboardCachedData: (
    payload: DashboardTransactionsCachePayload,
    expectedGeneration?: number,
  ) => Promise<void>;
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
const DEMO_MODE = __DEV__ && process.env.EXPO_PUBLIC_MOBILE_DEMO === '1';
const DEMO_SYNC_DELAY_MS = 320;
const CLOUD_SYNC_DEVICE_SETTING_KEYS = new Set<keyof AppSettings>([
  'cloudSyncKeyId',
  'cloudSyncLastSyncedAt',
  'cloudSyncLocalChangedAt',
  'cloudSyncMnemonic',
  'rememberCloudSyncCode',
  'autoSyncEnabled',
]);

function settingsAffectCloudPayload(settings: Partial<AppSettings>): boolean {
  return (Object.keys(settings) as Array<keyof AppSettings>)
    .some((key) => !CLOUD_SYNC_DEVICE_SETTING_KEYS.has(key));
}

function localChangeSettings(): Pick<AppSettings, 'cloudSyncLocalChangedAt'> {
  return { cloudSyncLocalChangedAt: new Date().toISOString() };
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

function createDemoState(now = new Date()): StorageState {
  return {
    ...defaultState,
    ...createDemoStorageFixture(now),
    connectionStatus: 'connected',
    isSyncing: false,
    pending: undefined,
    hasPendingChanges: false,
    connectionError: undefined,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isConfirmedInvalidToken(error: unknown): boolean {
  return isYnabApiError(error) && error.code === 'invalid_token';
}

function toCachedTransaction(transaction: YnabTransactionSummary): Transaction {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    account_id: transaction.account_id,
    transfer_account_id: transaction.transfer_account_id ?? null,
    transfer_transaction_id: transaction.transfer_transaction_id ?? null,
    payee_name: transaction.payee_name ?? null,
    category_name: transaction.category_name ?? null,
    memo: transaction.memo ?? null,
    cleared: transaction.cleared ?? null,
    approved: transaction.approved ?? false,
    flag_color: transaction.flag_color ?? null,
    flag_name: transaction.flag_name ?? null,
  };
}

function withoutConnection(state: StorageState): StorageState {
  return {
    ...state,
    pat: undefined,
    connectionStatus: 'disconnected',
    isSyncing: false,
    connectionError: undefined,
    selectedBudget: {},
    trackedAccountIds: [],
    pending: undefined,
    hasPendingChanges: false,
    calculations: [],
    cachedData: undefined,
    budgets: [],
    accounts: [],
    metadata: {},
  };
}

const noopActions: StorageActions = {
  refresh: async () => {},
  invalidatePendingOperations: () => 0,
  invalidateSyncRequests: () => {},
  setPAT: async () => true,
  clearPAT: async () => {},
  disconnect: async () => {},
  setSelectedBudget: async () => {},
  setTrackedAccountIds: async () => {},
  syncBudgetsAndAccounts: async () => {},
  stageBudgetSelection: () => {},
  stageTrackedAccountIds: () => {},
  applyPendingChanges: async () => true,
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

export function StorageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StorageState>(defaultState);
  const [status, setStatus] = useState<StorageStatus>(defaultStatus);
  const syncRequestIdRef = useRef(0);
  const cardConfigurationRevisionRef = useRef(0);
  const cardWritePromiseRef = useRef<Promise<void> | null>(null);
  const invalidateSyncRequests = useCallback(() => {
    syncRequestIdRef.current += 1;
    setState((prev) => (prev.isSyncing ? { ...prev, isSyncing: false } : prev));
  }, []);
  const invalidatePendingOperations = useCallback(() => {
    const generation = storage.invalidatePendingOperations();
    cardConfigurationRevisionRef.current += 1;
    invalidateSyncRequests();
    return generation;
  }, [invalidateSyncRequests]);

  const clearInvalidConnection = useCallback(async (message: string) => {
    invalidatePendingOperations();
    const storageGeneration = storage.captureGeneration();
    const localChange = localChangeSettings();

    try {
      await storage.clearPAT(storageGeneration, localChange);
    } catch (cleanupError) {
      if (__DEV__ && storage.isGenerationCurrent(storageGeneration)) {
        console.error('Failed to clear an invalid YNAB token', cleanupError);
      }
    }

    if (!storage.isGenerationCurrent(storageGeneration)) return;
    setState((prev) => ({
      ...withoutConnection(prev),
      settings: { ...prev.settings, ...localChange },
      connectionError: message,
    }));
  }, [invalidatePendingOperations]);

  const performSync = useCallback(
    async (
      options: SyncOptions = {},
      overrides: Partial<{ pat: string; selectedBudgetId?: string; trackedAccountIds: string[] }> = {},
      expectedGeneration?: number,
    ) => {
      const storageGeneration = expectedGeneration ?? storage.captureGeneration();
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      const syncRequestId = ++syncRequestIdRef.current;
      const isCurrentSync = () => (
        syncRequestId === syncRequestIdRef.current
        && storage.isGenerationCurrent(storageGeneration)
      );
      if (DEMO_MODE) {
        const attemptedAt = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          isSyncing: true,
          connectionStatus: 'connected',
          connectionError: undefined,
          metadata: {
            ...prev.metadata,
            lastAttemptedSync: attemptedAt,
          },
        }));
        setStatus((prev) => ({
          ...prev,
          refreshError: undefined,
        }));

        await new Promise<void>((resolve) => {
          setTimeout(resolve, DEMO_SYNC_DELAY_MS);
        });

        if (!isCurrentSync()) return;

        setState(createDemoState(new Date()));
        setStatus({ isHydrated: true, isRefreshing: false });
        return;
      }

      const pat = overrides.pat ?? state.pat;
      const selectedBudgetId = overrides.selectedBudgetId ?? state.selectedBudget.id;
      const trackedAccountIds = overrides.trackedAccountIds ?? state.trackedAccountIds;

      if (!pat) {
        setState((prev) => ({
          ...prev,
          connectionStatus: 'disconnected',
          isSyncing: false,
          connectionError: undefined,
        }));
        return;
      }

      if (!selectedBudgetId) {
        setState((prev) => ({
          ...prev,
          connectionStatus: 'awaiting_budget',
          isSyncing: false,
          connectionError: undefined,
        }));
        return;
      }

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
        const storedCards = await storage.getCards();
        const earliestPeriodStart = getEarliestPeriodStart(storedCards);
        const transactionSinceDate = options.skipTransactions
          ? undefined
          : options.sinceDate && options.sinceDate < earliestPeriodStart
            ? options.sinceDate
            : earliestPeriodStart;
        const result = await ynabSync.syncBudgetsAndAccounts({
          pat,
          selectedBudgetId,
          trackedAccountIds,
          sinceDate: transactionSinceDate,
          skipTransactions: options.skipTransactions,
        });

        if (!isCurrentSync()) return;
        if (cardWritePromiseRef.current) {
          await cardWritePromiseRef.current;
        }
        if (!isCurrentSync()) return;
        const latestStoredCards = await storage.getCards();
        if (!isCurrentSync()) return;

        let nextSelectedBudget: SelectedBudget =
          state.selectedBudget.id === selectedBudgetId
            ? state.selectedBudget
            : { id: selectedBudgetId };
        if (result.budgetId && result.budgetId !== selectedBudgetId) {
          const matched = result.budgets.find((budget) => budget.id === result.budgetId);
          if (matched) {
            if (!isCurrentSync()) return;
            await storage.setSelectedBudget(matched.id, matched.name, storageGeneration);
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
        const transactionsPayload = result.transactions.map(toCachedTransaction);

        // Account-only bootstrap syncs intentionally return no transactions.
        // Do not let that synthetic empty result evict a useful dashboard cache.
        if (effectiveBudgetId && !options.skipTransactions) {
          const payload: DashboardTransactionsCachePayload = {
            budgetId: effectiveBudgetId,
            sinceDate: transactionSinceDate!,
            fetchedAt: new Date().toISOString(),
            trackedAccountIds,
            transactions: transactionsPayload,
            accounts: result.accounts.map((account) => ({ id: account.id, name: account.name })),
          };

          if (!isCurrentSync()) return;
          await storage.setDashboardTransactionsCache(payload, storageGeneration);
          if (!isCurrentSync()) return;
          nextCachedData = await storage.getCachedData();
        }

        // Create tracked cards before calculating so first sync produces useful
        // calculations for the cards it just discovered.
        const cardsByAccountId = new Map(
          latestStoredCards.filter((c): c is CreditCard & { ynabAccountId: string } => Boolean(c.ynabAccountId))
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

        let updatedCards = latestStoredCards;
        if (newCards.length > 0) {
          for (const card of newCards) {
            if (!isCurrentSync()) return;
            await storage.saveCard(card, storageGeneration);
          }
          if (!isCurrentSync()) return;
          updatedCards = await storage.getCards();
        }

        let mergedCalculations = await storage.getCalculations();
        if (!options.skipTransactions) {
          // Card edits can complete while the YNAB request is in flight. Re-read
          // persisted configuration and retry calculation publication if it changes
          // again before the write completes.
          let calculationsPublished = false;
          while (!calculationsPublished) {
            if (!isCurrentSync()) return;
            if (cardWritePromiseRef.current) {
              await cardWritePromiseRef.current;
            }
            const cardRevision = cardConfigurationRevisionRef.current;
            const calculationCards = await storage.getCards();
            const calculationSettings = await storage.getSettings();
            const existingCalculations = await storage.getCalculations();
            if (!isCurrentSync()) return;
            if (cardRevision !== cardConfigurationRevisionRef.current) continue;

            const calculatedRewards = calculationCards.map((card) => {
              if (!card.ynabAccountId) {
                return null;
              }
              const period = SimpleRewardsCalculator.calculatePeriod(card);
              const cardTransactions = transactionsPayload.filter(
                (txn) => txn.account_id === card.ynabAccountId,
              );
              const calculation = SimpleRewardsCalculator.calculateCardRewards(
                card,
                cardTransactions,
                period,
                calculationSettings,
              );
              return {
                ...createRewardCalculationFromSimple(card, calculation),
                period: formatCalculationPeriod(period),
              };
            }).filter((value): value is RewardCalculation => Boolean(value));

            mergedCalculations = calculatedRewards.length > 0
              ? mergeRewardCalculations(existingCalculations, calculatedRewards)
              : existingCalculations;
            if (cardRevision !== cardConfigurationRevisionRef.current) continue;
            if (calculatedRewards.length > 0) {
              mergedCalculations = await storage.replaceCalculations(
                mergedCalculations,
                storageGeneration,
              );
            }
            if (!isCurrentSync()) return;
            if (cardRevision !== cardConfigurationRevisionRef.current) continue;
            updatedCards = calculationCards;
            calculationsPublished = true;
          }
        } else {
          updatedCards = await storage.getCards();
        }

        if (!isCurrentSync()) return;
        setState((prev) => ({
          ...prev,
          pat,
          budgets: result.budgets,
          accounts: result.accounts,
          selectedBudget: nextSelectedBudget,
          cachedData: options.skipTransactions ? prev.cachedData : nextCachedData,
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
      } catch (error) {
        if (!isCurrentSync()) return;
        if (isAbortError(error)) {
          setState((prev) => ({
            ...prev,
            connectionStatus: pat
              ? (prev.selectedBudget.id ? 'connected' : 'awaiting_budget')
              : 'disconnected',
            isSyncing: false,
            connectionError: undefined,
          }));
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to sync with YNAB';
        const failure = error instanceof Error ? error : new Error(message);

        if (isConfirmedInvalidToken(error)) {
          await clearInvalidConnection(message);
        } else {
          setState((prev) => ({
            ...prev,
            connectionStatus: 'error',
            isSyncing: false,
            connectionError: message,
          }));
        }

        if (__DEV__) {
          console.error('[StorageContext] performSync: failed', failure);
        }
        throw failure;
      }
    },
    [clearInvalidConnection, state.cachedData, state.pat, state.selectedBudget, state.trackedAccountIds],
  );

  const initialiseConnection = useCallback(
    async (
      pat: string,
      trackedAccountIds: string[],
      selectedBudgetId?: string,
      expectedGeneration?: number,
    ) => {
      const storageGeneration = expectedGeneration ?? storage.captureGeneration();
      const isCurrentConnection = () => storage.isGenerationCurrent(storageGeneration);
      if (!isCurrentConnection()) return;
      if (!pat) {
        setState((prev) => ({
          ...prev,
          connectionStatus: 'disconnected',
          isSyncing: false,
          connectionError: undefined,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        pat,
        connectionStatus: 'authenticating',
        isSyncing: false,
        connectionError: undefined,
      }));

      try {
        const budgets = await fetchBudgets(pat);
        if (!isCurrentConnection()) return;
        let nextBudget = selectedBudgetId ? budgets.find((budget) => budget.id === selectedBudgetId) : undefined;

        if (!nextBudget && budgets.length === 1) {
          nextBudget = budgets[0];
          await storage.setSelectedBudget(nextBudget.id, nextBudget.name, storageGeneration);
        }

        if (!nextBudget) {
          if (selectedBudgetId) {
            await storage.clearBudgetSelection(storageGeneration);
          }
          if (!isCurrentConnection()) return;
          setState((prev) => ({
            ...prev,
            pat,
            budgets,
            selectedBudget: {},
            accounts: [],
            connectionStatus: 'awaiting_budget',
            connectionError: undefined,
          }));
          return;
        }

        if (!isCurrentConnection()) return;
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
        }, storageGeneration);
      } catch (error) {
        if (!isCurrentConnection()) return;
        const message = error instanceof Error ? error.message : 'Failed to connect to YNAB';
        const failure = error instanceof Error ? error : new Error(message);

        if (isConfirmedInvalidToken(error)) {
          await clearInvalidConnection(message);
        } else {
          // Network, timeout, and rate-limit failures are recoverable. Keep the
          // hydrated credential, selection, cards, calculations, and cache.
          setState((prev) => ({
            ...prev,
            pat,
            connectionStatus: 'error',
            isSyncing: false,
            connectionError: message,
          }));
        }

        if (__DEV__) {
          console.error('[StorageContext] initialiseConnection: failed', failure);
        }
        throw failure;
      }
    },
    [clearInvalidConnection, performSync],
  );

  const initialiseConnectionRef = useRef(initialiseConnection);
  useEffect(() => {
    initialiseConnectionRef.current = initialiseConnection;
  }, [initialiseConnection]);

  useEffect(() => {
    let cancelled = false;
    const storageGeneration = storage.captureGeneration();

    const bootstrap = async () => {
      if (DEMO_MODE) {
        setState(createDemoState());
        setStatus({ isHydrated: true, isRefreshing: false });
        return;
      }

      let hydrated: StorageState;
      try {
        const next = await retryExpectedStorageCancellation(
          hydrate,
          () => !cancelled && storage.isGenerationCurrent(storageGeneration),
        );
        if (!next) return;
        hydrated = next;
      } catch (error) {
        if (cancelled || !storage.isGenerationCurrent(storageGeneration)) {
          return;
        }
        setStatus({
          isHydrated: true,
          isRefreshing: false,
          error: error instanceof Error ? error : new Error(LOAD_ERROR_MESSAGE),
        });
        return;
      }

      if (!storage.isGenerationCurrent(storageGeneration)) return;
      setState(hydrated);
      setStatus({ isHydrated: true, isRefreshing: false });

      if (hydrated.pat) {
        try {
          await initialiseConnectionRef.current(
            hydrated.pat,
            hydrated.trackedAccountIds,
            hydrated.selectedBudget.id,
          );
        } catch {
          // Connection errors are represented in state and remain retryable;
          // hydrated local data must stay usable instead of becoming root-fatal.
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (expectedGeneration?: number) => {
    const storageGeneration = expectedGeneration ?? storage.captureGeneration();
    if (!storage.isGenerationCurrent(storageGeneration)) return;
    if (DEMO_MODE) {
      await performSync();
      return;
    }

    setStatus((prev) => ({ ...prev, isRefreshing: true, refreshError: undefined }));
    try {
      const next = await retryExpectedStorageCancellation(
        hydrate,
        () => storage.isGenerationCurrent(storageGeneration),
      );
      if (!next) return;
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      const budgetChanged = next.selectedBudget.id !== state.selectedBudget.id;
      setState((prev) => ({
        ...next,
        metadata: budgetChanged ? {} : prev.metadata,
        budgets: budgetChanged ? [] : prev.budgets,
        accounts: budgetChanged ? [] : prev.accounts,
        pending: budgetChanged ? undefined : prev.pending,
        hasPendingChanges: budgetChanged ? false : prev.hasPendingChanges,
      }));
      if (budgetChanged && next.pat) {
        await initialiseConnectionRef.current(
          next.pat,
          next.trackedAccountIds,
          next.selectedBudget.id,
        );
      }
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      setStatus((prev) => ({ ...prev, refreshError: undefined }));
    } catch (error) {
      if (!storage.isGenerationCurrent(storageGeneration)) return;
      setStatus((prev) => ({
        ...prev,
        refreshError: error instanceof Error ? error : new Error(STORAGE_REFRESH_ERROR),
      }));
    } finally {
      if (storage.isGenerationCurrent(storageGeneration)) {
        setStatus((prev) => ({ ...prev, isRefreshing: false }));
      }
    }
  }, [performSync, state.selectedBudget.id]);

  // Demo actions are intentionally memory-only. This keeps simulator QA
  // hermetic: no fixture values (including the invalid session credential)
  // touch AsyncStorage, SecureStore, Cloud Sync, or YNAB.
  const demoActions = useMemo<StorageActions>(
    () => ({
      ...noopActions,
      refresh,
      invalidatePendingOperations,
      invalidateSyncRequests,
      setPAT: async () => {
        setState((prev) => ({
          ...prev,
          pat: createDemoStorageFixture().pat,
          connectionStatus: 'connected',
          connectionError: undefined,
        }));
        return true;
      },
      clearPAT: async () => {
        setState(withoutConnection);
      },
      disconnect: async () => {
        setState(withoutConnection);
      },
      setSelectedBudget: async (budgetId, budgetName) => {
        setState((prev) => ({
          ...prev,
          selectedBudget: { id: budgetId, name: budgetName },
          connectionError: undefined,
        }));
      },
      setTrackedAccountIds: async (accountIds) => {
        setState((prev) => ({ ...prev, trackedAccountIds: [...accountIds] }));
      },
      syncBudgetsAndAccounts: async (options, expectedGeneration) => {
        await performSync(options ?? {}, {}, expectedGeneration);
      },
      stageBudgetSelection: (budgetId, budgetName) => {
        setState((prev) => ({
          ...prev,
          pending: {
            ...prev.pending,
            budget: { id: budgetId, name: budgetName },
          },
          hasPendingChanges: true,
        }));
      },
      stageTrackedAccountIds: (ids) => {
        setState((prev) => ({
          ...prev,
          pending: {
            ...prev.pending,
            trackedAccountIds: [...new Set(ids)],
          },
          hasPendingChanges: true,
        }));
      },
      applyPendingChanges: async () => {
        setState((prev) => ({
          ...prev,
          selectedBudget: prev.pending?.budget ?? prev.selectedBudget,
          trackedAccountIds: prev.pending?.trackedAccountIds ?? prev.trackedAccountIds,
          pending: undefined,
          hasPendingChanges: false,
        }));
        return true;
      },
      clearPendingChanges: () => {
        setState((prev) => ({
          ...prev,
          pending: undefined,
          hasPendingChanges: false,
        }));
      },
      setSettings: async (settings) => {
        setState((prev) => ({
          ...prev,
          settings: { ...prev.settings, ...settings },
          calculations: Object.prototype.hasOwnProperty.call(settings, 'milesValuation')
            ? revalueRewardCalculations(
                prev.calculations,
                settings.milesValuation ?? 0.01,
              )
            : prev.calculations,
        }));
      },
      setCards: async (cards) => {
        setState((prev) => ({ ...prev, cards: [...cards] }));
      },
      setRules: async (rules) => {
        setState((prev) => ({ ...prev, rules: [...rules] }));
      },
      setTagMappings: async (tagMappings) => {
        setState((prev) => ({ ...prev, tagMappings: [...tagMappings] }));
      },
      setCalculations: async (calculations) => {
        setState((prev) => ({ ...prev, calculations: [...calculations] }));
      },
      setThemeGroups: async (themeGroups) => {
        setState((prev) => ({ ...prev, themeGroups: [...themeGroups] }));
      },
      setHiddenCards: async (hiddenCards) => {
        setState((prev) => ({ ...prev, hiddenCards: [...hiddenCards] }));
      },
      setDashboardCachedData: async (payload, expectedGeneration) => {
        const storageGeneration = expectedGeneration ?? storage.captureGeneration();
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        const entry: DashboardTransactionsCacheEntry = {
          ...payload,
          isComplete: payload.isComplete ?? true,
          requiresFullRefresh: payload.requiresFullRefresh ?? false,
          transactions: payload.transactions,
        };
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        setState((prev) => ({
          ...prev,
          cachedData: {
            ...(prev.cachedData ?? {}),
            lastUpdated: payload.fetchedAt,
            dashboardTransactions: [entry],
          },
        }));
      },
      pruneDashboardCache: async () => {},
    }),
    [invalidatePendingOperations, invalidateSyncRequests, performSync, refresh],
  );

  const actions = useMemo<StorageActions>(
    () => ({
      refresh,
      invalidatePendingOperations,
      invalidateSyncRequests,
      setPAT: async (pat: string) => {
        const trimmed = pat.trim();
        const storageGeneration = invalidatePendingOperations();
        try {
          await storage.setPAT(trimmed, storageGeneration);
          if (!storage.isGenerationCurrent(storageGeneration)) return false;
          const storedSelection = await storage.getSelectedBudget();
          if (!storage.isGenerationCurrent(storageGeneration)) return false;
          await initialiseConnection(
            trimmed,
            state.trackedAccountIds,
            storedSelection.id,
            storageGeneration,
          );
          return storage.isGenerationCurrent(storageGeneration);
        } catch (error) {
          if (
            !storage.isGenerationCurrent(storageGeneration)
            && !isConfirmedInvalidToken(error)
          ) {
            return false;
          }
          throw error;
        }
      },
      clearPAT: async () => {
        invalidatePendingOperations();
        const storageGeneration = storage.captureGeneration();
        const localChange = localChangeSettings();
        await storage.clearPAT(storageGeneration, localChange);
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        setState((prev) => ({
          ...withoutConnection(prev),
          settings: { ...prev.settings, ...localChange },
        }));
      },
      disconnect: async () => {
        invalidatePendingOperations();
        const storageGeneration = storage.captureGeneration();
        const localChange = localChangeSettings();
        await storage.clearPAT(storageGeneration, localChange);
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        setState((prev) => ({
          ...withoutConnection(prev),
          settings: { ...prev.settings, ...localChange },
        }));
      },
      setSelectedBudget: async (budgetId: string, budgetName: string) => {
        const localChange = localChangeSettings();
        await storage.updateSettings(localChange);
        await storage.setSelectedBudget(budgetId, budgetName);
        setState((prev) => ({
          ...prev,
          selectedBudget: { id: budgetId, name: budgetName },
          settings: { ...prev.settings, ...localChange },
          connectionError: undefined,
        }));
      },
      setTrackedAccountIds: async (accountIds: string[]) => {
        const localChange = localChangeSettings();
        await storage.updateSettings(localChange);
        await storage.setTrackedAccountIds(accountIds);
        setState((prev) => ({
          ...prev,
          trackedAccountIds: [...accountIds],
          settings: { ...prev.settings, ...localChange },
        }));
      },
      syncBudgetsAndAccounts: async (options, expectedGeneration) => {
        await performSync(options ?? {}, {}, expectedGeneration);
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
          return true;
        }
        const pending = state.pending;
        if (!pending || (!pending.budget && !pending.trackedAccountIds)) {
          return true;
        }

        const nextBudget = pending.budget ?? state.selectedBudget;
        const nextTrackedIds = pending.trackedAccountIds ?? state.trackedAccountIds;
        const wasSetupMode = !state.selectedBudget.id || state.trackedAccountIds.length === 0;
        const localChange = localChangeSettings();
        const storageGeneration = invalidatePendingOperations();
        try {
          await storage.updateSettings(localChange, storageGeneration);

          if (pending.budget && nextBudget.id && nextBudget.name) {
            await storage.setSelectedBudget(nextBudget.id, nextBudget.name, storageGeneration);
          }
          if (pending.trackedAccountIds) {
            await storage.setTrackedAccountIds(nextTrackedIds, storageGeneration);
          }

          if (!storage.isGenerationCurrent(storageGeneration)) return false;

          setState((prev) => ({
            ...prev,
            selectedBudget: nextBudget.id ? nextBudget : prev.selectedBudget,
            trackedAccountIds: pending.trackedAccountIds ? nextTrackedIds : prev.trackedAccountIds,
            settings: { ...prev.settings, ...localChange },
            pending: undefined,
            hasPendingChanges: false,
          }));

          return await runSetupSyncChain({
            expectedGeneration: storageGeneration,
            isCurrent: (generation) => storage.isGenerationCurrent(generation),
            runInitialSync: async (generation) => {
              await performSync({ skipTransactions: true }, {
                pat,
                selectedBudgetId: nextBudget.id,
                trackedAccountIds: nextTrackedIds,
              }, generation);
            },
            shouldRunFullSync: wasSetupMode && Boolean(nextBudget.id) && nextTrackedIds.length > 0,
            loadCards: () => storage.getCards(),
            runFullSync: async (cards, generation) => {
              await performSync({
                skipTransactions: false,
                sinceDate: getEarliestPeriodStart(cards),
              }, {
                pat,
                selectedBudgetId: nextBudget.id,
                trackedAccountIds: nextTrackedIds,
              }, generation);
            },
          });
        } catch (error) {
          if (
            !storage.isGenerationCurrent(storageGeneration)
            && !isConfirmedInvalidToken(error)
          ) {
            return false;
          }
          throw error;
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
        const updates = settingsAffectCloudPayload(settings)
          ? { ...settings, ...localChangeSettings() }
          : settings;
        await storage.updateSettings(updates);
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...updates,
          },
          calculations: Object.prototype.hasOwnProperty.call(settings, 'milesValuation')
            ? revalueRewardCalculations(
                prev.calculations,
                settings.milesValuation ?? 0.01,
              )
            : prev.calculations,
        }));
      },
      setCards: async (cards) => {
        cardConfigurationRevisionRef.current += 1;
        const write = (async () => {
          const localChange = localChangeSettings();
          await storage.updateSettings(localChange);
          const replacement = await storage.replaceCards(cards);
          setState((prev) => ({
            ...prev,
            ...replacement,
            settings: { ...prev.settings, ...localChange },
          }));
        })();
        const settledWrite = write.then(() => undefined, () => undefined);
        cardWritePromiseRef.current = settledWrite;
        try {
          await write;
        } finally {
          if (cardWritePromiseRef.current === settledWrite) {
            cardWritePromiseRef.current = null;
          }
        }
      },
      setRules: async (rules) => {
        const localChange = localChangeSettings();
        await storage.updateSettings(localChange);
        const persisted = await storage.replaceRules(rules);
        setState((prev) => ({
          ...prev,
          rules: persisted,
          settings: { ...prev.settings, ...localChange },
        }));
      },
      setTagMappings: async (mappings) => {
        const localChange = localChangeSettings();
        await storage.updateSettings(localChange);
        const persisted = await storage.replaceTagMappings(mappings);
        setState((prev) => ({
          ...prev,
          tagMappings: persisted,
          settings: { ...prev.settings, ...localChange },
        }));
      },
      setCalculations: async (calculations) => {
        const persisted = await storage.replaceCalculations(calculations);
        setState((prev) => ({
          ...prev,
          calculations: persisted,
        }));
      },
      setThemeGroups: async (groups) => {
        const localChange = localChangeSettings();
        await storage.updateSettings(localChange);
        const persisted = await storage.replaceThemeGroups(groups);
        setState((prev) => ({
          ...prev,
          themeGroups: persisted,
          settings: { ...prev.settings, ...localChange },
        }));
      },
      setHiddenCards: async (hiddenCards) => {
        const localChange = localChangeSettings();
        await storage.updateSettings(localChange);
        const persisted = await storage.replaceHiddenCards(hiddenCards);
        setState((prev) => ({
          ...prev,
          hiddenCards: persisted,
          settings: { ...prev.settings, ...localChange },
        }));
      },
      setDashboardCachedData: async (payload, expectedGeneration) => {
        const storageGeneration = expectedGeneration ?? storage.captureGeneration();
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        await storage.setDashboardTransactionsCache(payload, storageGeneration);
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        const cachedData = await storage.getCachedData();
        if (!storage.isGenerationCurrent(storageGeneration)) return;
        setState((prev) => ({
          ...prev,
          cachedData,
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
    [
      initialiseConnection,
      invalidatePendingOperations,
      invalidateSyncRequests,
      performSync,
      refresh,
      state.trackedAccountIds,
      state.pat,
      state.pending,
      state.selectedBudget,
    ],
  );

  const value = useMemo<StorageContextValue>(
    () => ({
      status,
      state,
      actions: DEMO_MODE ? demoActions : actions,
    }),
    [actions, demoActions, state, status],
  );

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageContextValue {
  return useContext(StorageContext);
}
