"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import {
  useYnabPAT,
  useCreditCards,
  useSelectedBudget,
  useTrackedAccountIds,
  useHiddenCards,
  useDashboardViewMode,
  useSettings
} from "@/hooks/useLocalStorage";
import { useAutoSync } from "@/hooks/useAutoSync";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { clampDaysLeft } from "@/lib/date";
import type { CreditCard, DashboardViewMode } from "@/lib/storage";
import { DashboardLanding } from "@/components/dashboard/DashboardLanding";
import { SetupProgressAlert } from "@/components/dashboard/SetupProgressAlert";
import { DashboardCardOverview } from "@/components/dashboard/DashboardCardOverview";
import { useTrackedTransactions } from "@/hooks/useTrackedTransactions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronDown, LayoutGrid, List, RefreshCw } from "lucide-react";

// Constants
const TRANSACTION_LOOKBACK_DAYS = 30;
const RECENT_TRANSACTIONS_LIMIT = 10;

// Format relative time for last updated display (standalone utility)
function formatLastUpdated(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  const now = new Date();

  // Guard against future timestamps to avoid negative time differences
  if (date.getTime() > now.getTime()) {
    return "just now";
  }
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  // Use explicit locale and format for consistent output
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
  const { selectedBudget } = useSelectedBudget();
  const { trackedAccountIds } = useTrackedAccountIds();

  const { hiddenCards, hideCard, unhideCard, isCardHidden } = useHiddenCards();
  const {
    viewMode: storedViewMode,
    setViewMode: persistDashboardViewMode,
    isLoading: isViewModeLoading
  } = useDashboardViewMode();
  const { settings, updateSettings } = useSettings();

  // Auto-sync settings from cloud on page load (once per 30 minutes)
  useAutoSync();

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

  const handleUnhideAll = useCallback(() => {
    hiddenCards.forEach((entry) => unhideCard(entry.cardId));
  }, [hiddenCards, unhideCard]);

  const featuredCards = useMemo(
    () => cards.filter((card) => card.featured ?? true),
    [cards]
  );

  const visibleFeaturedCards = useMemo(
    () => featuredCards.filter((card) => !isCardHidden(card.id)),
    [featuredCards, isCardHidden]
  );

  const applyStoredOrdering = useCallback(
    (list: CreditCard[], category: 'cashback' | 'miles' | 'all') => {
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

  const { allTransactions, loading, hasCachedData, refreshing, lastUpdatedAt, refresh } = useTrackedTransactions({
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

  const setupProgress = useMemo(
    () => Object.values(setupStatus).filter(Boolean).length,
    [setupStatus]
  );

  const setupPercentage = useMemo(
    () => (setupProgress / 4) * 100,
    [setupProgress]
  );

  // Group and sort cards
  const { cashbackCards, milesCards, allCards } = useMemo(() => {
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
    const orderedAll = applyStoredOrdering([...orderedCashback, ...orderedMiles], 'all');

    return { cashbackCards: orderedCashback, milesCards: orderedMiles, allCards: orderedAll };
  }, [visibleFeaturedCards, applyStoredOrdering]);

  const cashbackCollapsed = settings.collapsedCardGroups?.cashback ?? false;
  const milesCollapsed = settings.collapsedCardGroups?.miles ?? false;
  const groupByType = settings.groupCardsByType ?? true;

  const handleGroupByTypeToggle = useCallback(
    (checked: boolean) => {
      updateSettings({ groupCardsByType: checked });
    },
    [updateSettings]
  );

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
    (category: 'cashback' | 'miles' | 'all', orderedIds: string[]) => {
      const allCategoryIds = category === 'all'
        ? cards.map((card) => card.id)
        : cards.filter((card) => card.type === category).map((card) => card.id);
      const seen = new Set<string>();
      const dedupedOrdered = orderedIds.filter((id) => {
        if (seen.has(id) || !allCategoryIds.includes(id)) {
          return false;
        }
        seen.add(id);
        return true;
      });
      const remaining = allCategoryIds.filter((id) => !seen.has(id));

      const nextOrdering = [...dedupedOrdered, ...remaining];
      updateSettings({
        cardOrdering: {
          ...(settings.cardOrdering ?? {}),
          [category]: nextOrdering,
          ...(category === 'all'
            ? {
                cashback: nextOrdering.filter((id) =>
                  cards.some((card) => card.id === id && card.type === 'cashback')
                ),
                miles: nextOrdering.filter((id) =>
                  cards.some((card) => card.id === id && card.type === 'miles')
                ),
              }
            : {}),
        },
      });
    },
    [cards, settings.cardOrdering, updateSettings]
  );

  // Re-render every minute to update relative time (only when timestamp exists)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastUpdatedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [lastUpdatedAt]);

  // Empty state when nothing is configured
  if (!pat) {
    return <DashboardLanding />;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                {viewMode === "summary" ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <List className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {viewMode === "summary" ? "Summary" : "Detailed"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(v) => handleViewModeChange(v as DashboardViewMode)}
              >
                <DropdownMenuRadioItem value="summary">
                  Summary view
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="detailed">
                  Detailed view
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={groupByType}
                onCheckedChange={handleGroupByTypeToggle}
              >
                Group by card type
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={refresh}
              disabled={refreshing || loading}
              className="rounded-full px-2.5"
              title={lastUpdatedAt ? `Last updated: ${formatLastUpdated(lastUpdatedAt)}` : "Refresh data"}
              aria-label="Refresh dashboard data"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (refreshing || loading) && "animate-spin"
                )}
              />
            </Button>
            {lastUpdatedAt && !refreshing && !loading && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {formatLastUpdated(lastUpdatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isFullyConfigured && (
        <SetupProgressAlert
          setupStatus={setupStatus}
          setupProgress={setupProgress}
          setupPercentage={setupPercentage}
        />
      )}

  <DashboardCardOverview
        cards={cards}
        cashbackCards={cashbackCards}
        milesCards={milesCards}
        allCards={allCards}
        visibleFeaturedCards={visibleFeaturedCards}
        hiddenCards={hiddenCards}
        viewMode={viewMode}
        onHideCard={hideCard}
        onUnhideAll={handleUnhideAll}
        pat={pat}
        prefetchedTransactions={allTransactions}
        transactionsLoading={loading}
        transactionsRefreshing={refreshing}
        hasCachedTransactions={hasCachedData}
        cashbackCollapsed={cashbackCollapsed}
        milesCollapsed={milesCollapsed}
        onToggleGroup={handleToggleGroup}
        onReorderCards={handleCardReorder}
        groupByType={groupByType}
      />
    </div>
  );
}
