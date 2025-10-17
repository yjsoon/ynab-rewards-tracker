"use client";

import { useEffect, useCallback, useMemo } from "react";
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
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { clampDaysLeft } from "@/lib/date";
import type { CreditCard, DashboardViewMode } from "@/lib/storage";
import { DashboardLanding } from "@/components/dashboard/DashboardLanding";
import { SetupProgressAlert } from "@/components/dashboard/SetupProgressAlert";
import { RulesReminderAlert } from "@/components/dashboard/RulesReminderAlert";
import { DashboardCardOverview } from "@/components/dashboard/DashboardCardOverview";
import { useTrackedTransactions } from "@/hooks/useTrackedTransactions";

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

export default function DashboardPage() {
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const { rules } = useRewardRules();

  const { selectedBudget } = useSelectedBudget();
  const { trackedAccountIds } = useTrackedAccountIds();

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

  const { allTransactions, loading, hasCachedData, refreshing, lastUpdatedAt } = useTrackedTransactions({
    pat,
    selectedBudgetId: selectedBudget.id,
    trackedAccountIds,
    featuredCards,
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
    recentLimit: RECENT_TRANSACTIONS_LIMIT,
  });

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
        prefetchedTransactions={allTransactions}
        transactionsLoading={loading}
        transactionsRefreshing={refreshing}
        hasCachedTransactions={hasCachedData}
        transactionsLastUpdatedAt={lastUpdatedAt}
        cashbackCollapsed={cashbackCollapsed}
        milesCollapsed={milesCollapsed}
        onToggleGroup={handleToggleGroup}
        onReorderCards={handleCardReorder}
      />
    </div>
  );
}
