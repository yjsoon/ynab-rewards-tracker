"use client";

import { Suspense, useEffect, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useYnabPAT,
  useCreditCards,
  useSelectedBudget,
  useTrackedAccountIds,
  useHiddenCards,
  useSettings
} from "@/hooks/useLocalStorage";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { clampDaysLeft } from "@/lib/date";
import type { CreditCard, DashboardViewMode } from "@/lib/storage";
import type { SummaryViewSubcategoriesPreference } from "@/lib/storage";
import { DashboardLanding } from "@/components/dashboard/DashboardLanding";
import { SetupProgressAlert } from "@/components/dashboard/SetupProgressAlert";
import { DashboardCardOverview } from "@/components/dashboard/DashboardCardOverview";
import { AllCardsTab } from "@/components/dashboard/AllCardsTab";
import { DashboardPeriodNavigator } from "@/components/dashboard/DashboardPeriodNavigator";
import { useTrackedTransactions } from "@/hooks/useTrackedTransactions";
import { buildCardMetricsById } from "@/lib/card-metrics";
import {
  resolveDashboardPeriod,
  shiftDashboardPeriodDays,
  shiftDashboardPeriodMonths,
} from "@/lib/dashboard-period";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { storage } from "@/lib/storage";
import { RefreshCw, SlidersHorizontal } from "lucide-react";

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

const isExpansionMap = (
  value: SummaryViewSubcategoriesPreference | undefined
): value is Record<string, boolean> =>
  value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value);

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pat } = useYnabPAT();
  const { cards } = useCreditCards();
  const { selectedBudget } = useSelectedBudget();
  const { trackedAccountIds } = useTrackedAccountIds();

  const { hiddenCards, hideCard, unhideCard, isCardHidden } = useHiddenCards();
  const { settings, updateSettings } = useSettings();
  const [dayBoundaryTick, setDayBoundaryTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeoutMs = Math.max(1000, nextMidnight.getTime() - now.getTime() + 100);
    const timeoutId = window.setTimeout(() => {
      setDayBoundaryTick((tick) => tick + 1);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dayBoundaryTick]);

  // dayBoundaryTick is in the dep array so this re-evaluates at each day rollover.
  const currentTime = useMemo(
    () => Date.now() + dayBoundaryTick * 0,
    [dayBoundaryTick]
  );
  const liveDashboardPeriod = useMemo(
    () => resolveDashboardPeriod(null, null, new Date(currentTime)),
    [currentTime]
  );
  const dashboardPeriod = useMemo(
    () => resolveDashboardPeriod(searchParams.get("asOf"), searchParams.get("month"), new Date(currentTime)),
    [currentTime, searchParams]
  );

  // Tab state: "featured" (default) or "all"
  const [activeTab, setActiveTab] = useState<'featured' | 'all'>(() => {
    return searchParams.get('tab') === 'all' || searchParams.get('card')
      ? 'all'
      : 'featured';
  });
  const [initialCardId, setInitialCardId] = useState<string | null>(
    () => searchParams.get('card')
  );

  // Sync tab and card from URL changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const cardParam = searchParams.get('card');
    if (cardParam) {
      setActiveTab('all');
      setInitialCardId(cardParam);
      return;
    }
    setActiveTab(tabParam === 'all' ? 'all' : 'featured');
    setInitialCardId(null);
  }, [searchParams]);

  // Sync tab to URL
  const handleTabChange = useCallback((tab: 'featured' | 'all') => {
    setActiveTab(tab);
    setInitialCardId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'all') params.set('tab', 'all');
    else params.delete('tab');
    params.delete('card');
    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(newUrl);
  }, [pathname, router, searchParams]);

  const handleDashboardDateChange = useCallback((dateValue: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("month");
    if (!dateValue || dateValue === liveDashboardPeriod.dateValue) {
      params.delete("asOf");
    } else {
      params.set("asOf", dateValue);
    }

    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(newUrl);
  }, [liveDashboardPeriod.dateValue, pathname, router, searchParams]);

  const handlePreviousDay = useCallback(() => {
    handleDashboardDateChange(shiftDashboardPeriodDays(dashboardPeriod.dateValue, -1));
  }, [dashboardPeriod.dateValue, handleDashboardDateChange]);

  const handleNextDay = useCallback(() => {
    if (dashboardPeriod.isToday) {
      return;
    }
    handleDashboardDateChange(shiftDashboardPeriodDays(dashboardPeriod.dateValue, 1));
  }, [dashboardPeriod.dateValue, dashboardPeriod.isToday, handleDashboardDateChange]);

  const handlePreviousMonth = useCallback(() => {
    handleDashboardDateChange(shiftDashboardPeriodMonths(dashboardPeriod.dateValue, -1));
  }, [dashboardPeriod.dateValue, handleDashboardDateChange]);

  const handleNextMonth = useCallback(() => {
    if (dashboardPeriod.isToday) {
      return;
    }
    handleDashboardDateChange(shiftDashboardPeriodMonths(dashboardPeriod.dateValue, 1));
  }, [dashboardPeriod.dateValue, dashboardPeriod.isToday, handleDashboardDateChange]);

  const handleResetDate = useCallback(() => {
    handleDashboardDateChange(null);
  }, [handleDashboardDateChange]);

  const viewMode: DashboardViewMode = 'summary';

  const handleUnhideAll = useCallback(() => {
    hiddenCards.forEach((entry) => unhideCard(entry.cardId));
  }, [hiddenCards, unhideCard]);

  const featuredCards = useMemo(
    () => cards.filter((card) => card.featured ?? true),
    [cards]
  );

  const visibleFeaturedCards = useMemo(
    () => (
      dashboardPeriod.isToday
        ? featuredCards.filter((card) => !isCardHidden(card.id))
        : featuredCards
    ),
    [dashboardPeriod.isToday, featuredCards, isCardHidden]
  );
  const effectiveHiddenCards = dashboardPeriod.isToday ? hiddenCards : [];

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

  const shouldLoadTrackedTransactions =
    activeTab === 'featured' &&
    !!pat &&
    !!selectedBudget.id &&
    trackedAccountIds.length > 0;

  const { allTransactions, loading, hasCachedData, refreshing, lastUpdatedAt, refresh } = useTrackedTransactions({
    enabled: shouldLoadTrackedTransactions,
    pat,
    selectedBudgetId: selectedBudget.id,
    trackedAccountIds,
    featuredCards,
    lookbackDays: TRANSACTION_LOOKBACK_DAYS,
    recentLimit: RECENT_TRANSACTIONS_LIMIT,
    referenceDate: dashboardPeriod.referenceDate,
  });
  const [flagNames, setFlagNames] = useState(() => storage.getFlagNames());

  useEffect(() => {
    setFlagNames(storage.getFlagNames());
  }, [lastUpdatedAt, selectedBudget.id]);
  const summaryViewSubcategoriesExpanded = settings.summaryViewSubcategoriesExpanded;
  const handleToggleSummarySubcategories = useCallback(
    (cardId: string) => {
      const currentSetting = summaryViewSubcategoriesExpanded;
      const currentValue = isExpansionMap(currentSetting)
        ? currentSetting[cardId] ?? false
        : Boolean(currentSetting);

      const nextValue = !currentValue;
      const nextSetting: SummaryViewSubcategoriesPreference = isExpansionMap(currentSetting)
        ? { ...currentSetting, [cardId]: nextValue }
        : { [cardId]: nextValue };

      updateSettings({
        summaryViewSubcategoriesExpanded: nextSetting,
      });
    },
    [summaryViewSubcategoriesExpanded, updateSettings]
  );
  const cardMetricsById = useMemo(
    () => (
      activeTab === 'featured'
        ? buildCardMetricsById(
            visibleFeaturedCards,
            allTransactions,
            settings,
            dashboardPeriod.referenceDate
          )
        : {}
    ),
    [
      activeTab,
      allTransactions,
      dashboardPeriod.referenceDate,
      settings,
      visibleFeaturedCards,
    ]
  );

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
    const sortReferenceDate = dashboardPeriod.referenceDate;

    const getDaysRemaining = (card: (typeof cards)[0]) => {
      const period = SimpleRewardsCalculator.calculatePeriod(card, sortReferenceDate);
      const periodDate = {
        startDate: new Date(period.start),
        endDate: new Date(period.end)
      };
      return clampDaysLeft(periodDate, sortReferenceDate);
    };

    const cashback = visibleFeaturedCards.filter((c) => c.type === "cashback");
    const miles = visibleFeaturedCards.filter((c) => c.type === "miles");

    cashback.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));
    miles.sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b));

    const orderedCashback = applyStoredOrdering(cashback, 'cashback');
    const orderedMiles = applyStoredOrdering(miles, 'miles');
    const orderedAll = applyStoredOrdering([...orderedCashback, ...orderedMiles], 'all');

    return { cashbackCards: orderedCashback, milesCards: orderedMiles, allCards: orderedAll };
  }, [visibleFeaturedCards, applyStoredOrdering, dashboardPeriod.referenceDate]);

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
      const allCategoryIdsSet = new Set(allCategoryIds);
      const seen = new Set<string>();
      const dedupedOrdered = orderedIds.filter((id) => {
        if (seen.has(id) || !allCategoryIdsSet.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      });
      const remaining = allCategoryIds.filter((id) => !seen.has(id));

      const nextOrdering = [...dedupedOrdered, ...remaining];

      let cashbackOrdering: string[] | undefined;
      let milesOrdering: string[] | undefined;
      if (category === 'all') {
        const cardTypeById = new Map(cards.map((card) => [card.id, card.type]));
        cashbackOrdering = nextOrdering.filter(
          (id) => cardTypeById.get(id) === 'cashback'
        );
        milesOrdering = nextOrdering.filter(
          (id) => cardTypeById.get(id) === 'miles'
        );
      }

      updateSettings({
        cardOrdering: {
          ...(settings.cardOrdering ?? {}),
          [category]: nextOrdering,
          ...(category === 'all'
            ? {
                cashback: cashbackOrdering,
                miles: milesOrdering,
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="shrink-0 flex items-center rounded-lg border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => handleTabChange('featured')}
            className={cn(
              "whitespace-nowrap px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors",
              activeTab === 'featured'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Featured
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('all')}
            className={cn(
              "whitespace-nowrap px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors",
              activeTab === 'all'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All Cards
          </button>
        </div>
        {activeTab === 'featured' && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <DashboardPeriodNavigator
              dateValue={dashboardPeriod.dateValue}
              monthLabel={dashboardPeriod.monthLabel}
              asOfLabel={dashboardPeriod.asOfLabel}
              triggerLabel={dashboardPeriod.triggerLabel}
              maxDateValue={liveDashboardPeriod.dateValue}
              isToday={dashboardPeriod.isToday}
              onPreviousDay={handlePreviousDay}
              onNextDay={handleNextDay}
              onPreviousMonth={handlePreviousMonth}
              onNextMonth={handleNextMonth}
              onReset={handleResetDate}
              onDateChange={handleDashboardDateChange}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={refresh}
              disabled={!shouldLoadTrackedTransactions || refreshing || loading}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full px-2.5"
                  aria-label="View options"
                  title="View options"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuCheckboxItem
                  checked={groupByType}
                  onCheckedChange={handleGroupByTypeToggle}
                >
                  Group cards by type
                </DropdownMenuCheckboxItem>
                {lastUpdatedAt && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Updated {formatLastUpdated(lastUpdatedAt)}
                    </DropdownMenuLabel>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {!isFullyConfigured && (
        <SetupProgressAlert
          setupStatus={setupStatus}
          setupProgress={setupProgress}
          setupPercentage={setupPercentage}
        />
      )}

      {activeTab === 'featured' ? (
        <DashboardCardOverview
          cards={cards}
          cardMetricsById={cardMetricsById}
          cashbackCards={cashbackCards}
          milesCards={milesCards}
          allCards={allCards}
          visibleFeaturedCards={visibleFeaturedCards}
          hiddenCards={effectiveHiddenCards}
          flagNames={flagNames}
          settings={settings}
          summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
          viewMode={viewMode}
          onToggleSummarySubcategories={handleToggleSummarySubcategories}
          onHideCard={hideCard}
          onUnhideCard={unhideCard}
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
          referenceDate={dashboardPeriod.referenceDate}
          allowHideCards={dashboardPeriod.isToday}
        />
      ) : (
        <AllCardsTab initialCardId={initialCardId} />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-6 py-8"><div className="h-8 w-48 bg-muted animate-pulse rounded" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
