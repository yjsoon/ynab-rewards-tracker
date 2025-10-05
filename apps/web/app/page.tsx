"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useYnabPAT,
  useCreditCards,
  useRewardRules,
  useSelectedBudget,
  useTrackedAccountIds,
  useHiddenCards,
  useDashboardViewMode,
  useSettings
} from "@/hooks/useLocalStorage";
import { YnabClient } from "@/lib/ynab-client";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { clampDaysLeft } from "@/lib/date";
import type { CreditCard, DashboardViewMode } from "@/lib/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { DashboardLanding } from "@/components/dashboard/DashboardLanding";
import { SetupProgressAlert } from "@/components/dashboard/SetupProgressAlert";
import { RulesReminderAlert } from "@/components/dashboard/RulesReminderAlert";
import { DashboardCardOverview } from "@/components/dashboard/DashboardCardOverview";
import { DashboardQuickStats } from "@/components/dashboard/DashboardQuickStats";
import { RecentTransactionsTable } from "@/components/dashboard/RecentTransactionsTable";
import type { Transaction } from "@/types/transaction";

// Constants
const TRANSACTION_LOOKBACK_DAYS = 30;
const RECENT_TRANSACTIONS_LIMIT = 10;

// Types for better type safety

interface SetupStatus {
  pat: boolean;
  budget: boolean;
  accounts: boolean;
  cards: boolean;
}

interface YnabAccountSummary {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const { rules } = useRewardRules();

  const { selectedBudget } = useSelectedBudget();
  const { trackedAccountIds } = useTrackedAccountIds();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allBudgetTransactions, setAllBudgetTransactions] = useState<
    Transaction[]
  >([]);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dashboardAbortRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef("");

  const { hiddenCards, hideCard, unhideCard, isCardHidden } = useHiddenCards();
  const {
    viewMode: storedViewMode,
    setViewMode: persistDashboardViewMode,
    isLoading: isViewModeLoading
  } = useDashboardViewMode();
  const { settings, updateSettings } = useSettings();

  const viewMode: DashboardViewMode = isViewModeLoading ? 'summary' : storedViewMode;

  const handleViewModeChange = useCallback(
    (mode: DashboardViewMode) => {
      persistDashboardViewMode(mode);
      if (typeof window === 'undefined') {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (mode === 'detailed') {
        params.set('view', 'detailed');
      } else {
        params.delete('view');
      }
      const query = params.toString();
      const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    },
    [persistDashboardViewMode]
  );

  const handleHideCard = useCallback(
    (cardId: string, hiddenUntil: string) => {
      hideCard(cardId, hiddenUntil);
    },
    [hideCard]
  );

  const handleUnhideCard = useCallback(
    (cardId: string) => {
      unhideCard(cardId);
    },
    [unhideCard]
  );

  const handleUnhideAll = useCallback(() => {
    hiddenCards.forEach((entry) => handleUnhideCard(entry.cardId));
  }, [hiddenCards, handleUnhideCard]);

  const featuredCards = useMemo(
    () => cards.filter((card) => card.featured ?? true),
    [cards]
  );

  const visibleFeaturedCards = useMemo(
    () => featuredCards.filter((card) => !isCardHidden(card.id)),
    [featuredCards, isCardHidden]
  );

  const applyStoredOrdering = useCallback(
    (list: CreditCard[], category: 'cashback' | 'miles') => {
      const stored = settings.cardOrdering?.[category];
      if (!stored || stored.length === 0) {
        return list;
      }

      const map = new Map(list.map((card) => [card.id, card]));
      const used = new Set<string>();
      const ordered: CreditCard[] = [];

      stored.forEach((id) => {
        const card = map.get(id);
        if (card && !used.has(id)) {
          ordered.push(card);
          used.add(id);
        }
      });

      list.forEach((card) => {
        if (!used.has(card.id)) {
          ordered.push(card);
        }
      });

      return ordered;
    },
    [settings.cardOrdering]
  );

  const earliestTrackedWindow = useMemo(() => {
    if (featuredCards.length === 0) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() - TRANSACTION_LOOKBACK_DAYS);
      return fallback.toISOString().split("T")[0];
    }

    const earliestMillis = featuredCards
      .map((card) => SimpleRewardsCalculator.calculatePeriod(card))
      .map((period) => new Date(period.start).getTime())
      .reduce(
        (min, current) => Math.min(min, current),
        Number.POSITIVE_INFINITY
      );

    return new Date(earliestMillis).toISOString().split("T")[0];
  }, [featuredCards]);

  const loadRecentTransactions = useCallback(
    async (budgetId: string, accountFilter: string[]) => {
      if (!pat) return;

      setLoading(true);
      setError("");

      if (dashboardAbortRef.current) {
        dashboardAbortRef.current.abort();
      }
      const controller = new AbortController();
      dashboardAbortRef.current = controller;

      try {
        const client = new YnabClient(pat);

        const accounts = await client.getAccounts<YnabAccountSummary>(
          budgetId,
          { signal: controller.signal }
        );
        const accMap = new Map<string, string>();
        accounts.forEach((acc) => {
          accMap.set(acc.id, acc.name);
        });
        setAccountsMap(accMap);

        const txns = await client.getTransactions(budgetId, {
          since_date: earliestTrackedWindow,
          signal: controller.signal
        });

        setAllBudgetTransactions(txns);

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - TRANSACTION_LOOKBACK_DAYS);
        const recent = txns
          .filter(
            (t: Transaction) =>
              accountFilter.length === 0 || accountFilter.includes(t.account_id)
          )
          .filter((t: Transaction) => new Date(t.date) >= cutoff)
          .sort(
            (a: Transaction, b: Transaction) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
          )
          .slice(0, RECENT_TRANSACTIONS_LIMIT);
        setTransactions(recent);
      } catch (err) {
        if (!(err instanceof Error) || err.name !== "AbortError") {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Failed to load transactions: ${errorMessage}`);
          lastFetchKeyRef.current = "";
        }
      } finally {
        if (dashboardAbortRef.current === controller) {
          setLoading(false);
          dashboardAbortRef.current = null;
        }
      }
    },
    [pat, earliestTrackedWindow]
  );

  useEffect(() => {
    if (!pat || !selectedBudget.id) {
      lastFetchKeyRef.current = "";
      return;
    }

    const sortedAccountsKey = [...trackedAccountIds].sort().join("|");
    const fetchKey = [
      pat,
      selectedBudget.id,
      sortedAccountsKey,
      earliestTrackedWindow
    ].join("::");

    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }

    lastFetchKeyRef.current = fetchKey;
    loadRecentTransactions(selectedBudget.id, trackedAccountIds);
  }, [
    pat,
    selectedBudget.id,
    trackedAccountIds,
    earliestTrackedWindow,
    loadRecentTransactions
  ]);

  useEffect(() => {
    return () => {
      dashboardAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('view');
    if (mode === 'summary' || mode === 'detailed') {
      persistDashboardViewMode(mode);
    }
  }, [persistDashboardViewMode]);

  // Calculate some basic stats with memoization
  const setupStatus = useMemo<SetupStatus>(
    () => ({
      pat: !!pat,
      budget: !!selectedBudget.id,
      accounts: trackedAccountIds.length > 0,
      cards: cards.length > 0
    }),
    [pat, selectedBudget.id, trackedAccountIds.length, cards.length]
  );

  const isFullyConfigured = useMemo(
    () => setupStatus.pat && setupStatus.budget && setupStatus.accounts,
    [setupStatus]
  );

  const hasUnsetMinimumSpend = useMemo(
    () =>
      cards.some(
        (card) => card.minimumSpend === null || card.minimumSpend === undefined
      ),
    [cards]
  );

  const setupProgress = useMemo(
    () => Object.values(setupStatus).filter(Boolean).length,
    [setupStatus]
  );

  const setupPercentage = useMemo(
    () => (setupProgress / 4) * 100,
    [setupProgress]
  );

  // Group and sort cards
  const { cashbackCards, milesCards } = useMemo(() => {
    const now = new Date();

    const getDaysRemaining = (card: (typeof cards)[0]) => {
      const period = SimpleRewardsCalculator.calculatePeriod(card);
      const periodDate = {
        startDate: new Date(period.start),
        endDate: new Date(period.end)
      };
      return clampDaysLeft(periodDate, now);
    };

    const cashback = visibleFeaturedCards.filter((c) => c.type === "cashback");
    const miles = visibleFeaturedCards.filter((c) => c.type === "miles");

    cashback.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));
    miles.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));

    const orderedCashback = applyStoredOrdering(cashback, 'cashback');
    const orderedMiles = applyStoredOrdering(miles, 'miles');

    return { cashbackCards: orderedCashback, milesCards: orderedMiles };
  }, [visibleFeaturedCards, applyStoredOrdering]);

  const cashbackCollapsed = settings.collapsedCardGroups?.cashback ?? false;
  const milesCollapsed = settings.collapsedCardGroups?.miles ?? false;

  const handleToggleGroup = useCallback(
    (category: 'cashback' | 'miles') => {
      const collapsed = settings.collapsedCardGroups ?? {};
      updateSettings({
        collapsedCardGroups: {
          ...collapsed,
          [category]: !(collapsed[category] ?? false),
        },
      });
    },
    [settings.collapsedCardGroups, updateSettings]
  );

  const handleCardReorder = useCallback(
    (category: 'cashback' | 'miles', orderedIds: string[]) => {
      const allCategoryIds = cards.filter((card) => card.type === category).map((card) => card.id);
      const seen = new Set<string>();
      const dedupedOrdered = orderedIds.filter((id) => {
        if (seen.has(id) || !allCategoryIds.includes(id)) {
          return false;
        }
        seen.add(id);
        return true;
      });
      const remaining = allCategoryIds.filter((id) => !seen.has(id));

      updateSettings({
        cardOrdering: {
          ...(settings.cardOrdering ?? {}),
          [category]: [...dedupedOrdered, ...remaining],
        },
      });
    },
    [cards, settings.cardOrdering, updateSettings]
  );

  // Empty state when nothing is configured
  if (!pat) {
    return <DashboardLanding />;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {!isFullyConfigured && (
        <SetupProgressAlert
          setupStatus={setupStatus}
          setupProgress={setupProgress}
          setupPercentage={setupPercentage}
        />
      )}

      <RulesReminderAlert
        show={isFullyConfigured && cards.length > 0 && rules.length === 0 && hasUnsetMinimumSpend}
      />

      <DashboardCardOverview
        cards={cards}
        cashbackCards={cashbackCards}
        milesCards={milesCards}
        visibleFeaturedCards={visibleFeaturedCards}
        hiddenCards={hiddenCards}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onHideCard={handleHideCard}
        onUnhideAll={handleUnhideAll}
        pat={pat}
        prefetchedTransactions={allBudgetTransactions}
        cashbackCollapsed={cashbackCollapsed}
        milesCollapsed={milesCollapsed}
        onToggleGroup={handleToggleGroup}
        onReorderCards={handleCardReorder}
      />

      <DashboardQuickStats
        selectedBudget={selectedBudget}
        trackedAccountCount={trackedAccountIds.length}
      />

      {isFullyConfigured && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>
              Recent Transactions (Last {TRANSACTION_LOOKBACK_DAYS} Days)
            </CardTitle>
            <CardDescription>
              Your most recent transactions from tracked accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentTransactionsTable
              loading={loading}
              error={error}
              transactions={transactions}
              accountsMap={accountsMap}
              lookbackDays={TRANSACTION_LOOKBACK_DAYS}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
