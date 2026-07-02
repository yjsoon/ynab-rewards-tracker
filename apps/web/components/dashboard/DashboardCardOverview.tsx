"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CreditCard as CreditCardIcon,
  GripVertical,
  Loader2,
  Percent,
  TrendingUp,
} from "lucide-react";

import type {
  AppSettings,
  CreditCard,
  DashboardViewMode,
  HiddenCard,
  SummaryViewSubcategoriesPreference,
} from "@/lib/storage";
import type { YnabFlagColor } from "@/lib/ynab-constants";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PrefetchedCardMetrics } from "@/lib/card-metrics";
import { DashboardCardTile } from "@/components/dashboard/DashboardCardTile";
import { DashboardStatusSummary } from "@/components/dashboard/DashboardStatusSummary";
import type { SortableDashboardCardGridProps } from "@/components/dashboard/SortableDashboardCardGrid";

type SortableGridComponent = ComponentType<SortableDashboardCardGridProps>;

const loadSortableDashboardCardGrid = (): Promise<SortableGridComponent> =>
  import("./SortableDashboardCardGrid").then(
    (module) => module.SortableDashboardCardGrid,
  );

function DashboardCardSkeleton({ viewMode }: { viewMode: DashboardViewMode }) {
  return (
    <Card className="opacity-60">
      <CardHeader className="pb-3">
        <div className="h-5 bg-muted rounded w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        {viewMode === "detailed" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
            </div>
            <div className="h-2 bg-muted rounded w-full" />
            <div className="h-10 bg-muted rounded w-full" />
          </>
        ) : (
          <>
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-2 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface DashboardCardOverviewProps {
  cards: CreditCard[];
  cardMetricsById: Record<string, PrefetchedCardMetrics>;
  cashbackCards: CreditCard[];
  milesCards: CreditCard[];
  allCards: CreditCard[];
  visibleFeaturedCards: CreditCard[];
  hiddenCards: HiddenCard[];
  flagNames: Partial<Record<YnabFlagColor, string>>;
  settings: AppSettings;
  summaryViewSubcategoriesExpanded?: SummaryViewSubcategoriesPreference;
  viewMode: DashboardViewMode;
  onToggleSummarySubcategories(cardId: string): void;
  onHideCard(cardId: string, hiddenUntil: string): void;
  onUnhideCard(cardId: string): void;
  onUnhideAll(): void;
  pat: string;
  prefetchedTransactions: Transaction[];
  transactionsLoading: boolean;
  transactionsRefreshing: boolean;
  hasCachedTransactions: boolean;
  cashbackCollapsed: boolean;
  milesCollapsed: boolean;
  onToggleGroup(category: "cashback" | "miles"): void;
  onReorderCards(
    category: "cashback" | "miles" | "all",
    orderedIds: string[],
  ): void;
  groupByType?: boolean;
  referenceDate?: Date;
  allowHideCards?: boolean;
}

export function DashboardCardOverview({
  cards,
  cardMetricsById,
  cashbackCards,
  milesCards,
  allCards,
  visibleFeaturedCards,
  hiddenCards,
  flagNames,
  settings,
  summaryViewSubcategoriesExpanded,
  viewMode,
  onToggleSummarySubcategories,
  onHideCard,
  onUnhideCard,
  onUnhideAll,
  pat,
  prefetchedTransactions,
  transactionsLoading,
  transactionsRefreshing,
  hasCachedTransactions,
  cashbackCollapsed,
  milesCollapsed,
  onToggleGroup,
  onReorderCards,
  groupByType = true,
  referenceDate,
  allowHideCards = true,
}: DashboardCardOverviewProps) {
  const hiddenCount = hiddenCards.length;
  const hasVisibleCards = visibleFeaturedCards.length > 0;

  const isInitialLoading = transactionsLoading && !hasCachedTransactions;
  const [SortableGrid, setSortableGrid] = useState<SortableGridComponent | null>(
    null,
  );

  const handleShowAll = useCallback(() => {
    onUnhideAll();
  }, [onUnhideAll]);

  useEffect(() => {
    if (typeof window === "undefined" || SortableGrid) {
      return;
    }

    let cancelled = false;
    const load = () => {
      void loadSortableDashboardCardGrid().then((Component) => {
        if (!cancelled) {
          setSortableGrid(() => Component);
        }
      });
    };

    const idle = (
      window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout?: number },
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
      }
    ).requestIdleCallback;

    if (idle) {
      const handle = idle(load, { timeout: 2000 });
      return () => {
        cancelled = true;
        (
          window as Window & {
            cancelIdleCallback?: (handle: number) => void;
          }
        ).cancelIdleCallback?.(handle);
      };
    }

    const timer = window.setTimeout(load, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [SortableGrid]);

  const summaryContent = useMemo(() => {
    if (isInitialLoading && visibleFeaturedCards.length > 0) {
      const skeletonCount = Math.min(visibleFeaturedCards.length, 6);
      return (
        <div
          className={cn(
            "grid gap-4",
            viewMode === "detailed"
              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <DashboardCardSkeleton key={i} viewMode={viewMode} />
          ))}
        </div>
      );
    }

    if (cards.length === 0) {
      return (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Your Reward Cards</CardTitle>
            <CardDescription>
              Manage your credit cards and their reward rules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <CreditCardIcon
                className="h-12 w-12 text-muted-foreground mx-auto mb-4"
                aria-hidden="true"
              />
              <p className="text-lg mb-4 text-muted-foreground">
                No cards configured yet
              </p>
              <Button asChild>
                <Link href="/settings">
                  <CreditCardIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add Your First Card
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!hasVisibleCards) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>All cards hidden</CardTitle>
            <CardDescription>
              Hidden cards will return when their next billing cycle starts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              {hiddenCount === 1
                ? "1 card is currently hidden."
                : `${hiddenCount} cards are currently hidden.`}
            </p>
            <Button variant="outline" onClick={handleShowAll}>
              Show hidden cards now
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Ungrouped mode: show all cards in a single grid
    if (!groupByType) {
      // Combine already-ordered cashback and miles cards
      const allOrderedCards = allCards;

      return (
        <CardGroup
          category="all"
          title=""
          icon={null}
          cards={allOrderedCards}
          cardMetricsById={cardMetricsById}
          flagNames={flagNames}
          settings={settings}
          summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
          viewMode={viewMode}
          pat={pat}
          prefetchedTransactions={prefetchedTransactions}
          onToggleSummarySubcategories={onToggleSummarySubcategories}
          onHideCard={onHideCard}
          isCollapsed={false}
          onToggleCollapse={() => {}}
          onReorderCards={(orderedIds) => onReorderCards("all", orderedIds)}
          isRefreshing={transactionsRefreshing}
          showTypeBadge
          referenceDate={referenceDate}
          allowHideCards={allowHideCards}
          SortableGrid={SortableGrid}
        />
      );
    }

    // Grouped mode: show Cashback and Miles sections
    return (
      <>
        {cashbackCards.length > 0 && (
          <CardGroup
            category="cashback"
            title="Cashback Cards"
            icon={
              <Percent className="h-4 w-4 text-green-600" aria-hidden="true" />
            }
            cards={cashbackCards}
            cardMetricsById={cardMetricsById}
            flagNames={flagNames}
            settings={settings}
            summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onToggleSummarySubcategories={onToggleSummarySubcategories}
            onHideCard={onHideCard}
            isCollapsed={cashbackCollapsed}
            onToggleCollapse={() => onToggleGroup("cashback")}
            onReorderCards={(orderedIds) =>
              onReorderCards("cashback", orderedIds)
            }
            isRefreshing={transactionsRefreshing}
            referenceDate={referenceDate}
            allowHideCards={allowHideCards}
            SortableGrid={SortableGrid}
          />
        )}
        {milesCards.length > 0 && (
          <CardGroup
            category="miles"
            title="Miles Cards"
            icon={
              <TrendingUp
                className="h-4 w-4 text-blue-600"
                aria-hidden="true"
              />
            }
            cards={milesCards}
            cardMetricsById={cardMetricsById}
            flagNames={flagNames}
            settings={settings}
            summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onToggleSummarySubcategories={onToggleSummarySubcategories}
            onHideCard={onHideCard}
            isCollapsed={milesCollapsed}
            onToggleCollapse={() => onToggleGroup("miles")}
            onReorderCards={(orderedIds) => onReorderCards("miles", orderedIds)}
            isRefreshing={transactionsRefreshing}
            referenceDate={referenceDate}
            allowHideCards={allowHideCards}
            SortableGrid={SortableGrid}
          />
        )}
      </>
    );
  }, [
    isInitialLoading,
    cards.length,
    cardMetricsById,
    hasVisibleCards,
    cashbackCards,
    flagNames,
    settings,
    summaryViewSubcategoriesExpanded,
    viewMode,
    pat,
    prefetchedTransactions,
    onToggleSummarySubcategories,
    onHideCard,
    milesCards,
    allCards,
    hiddenCount,
    handleShowAll,
    SortableGrid,
    cashbackCollapsed,
    milesCollapsed,
    onToggleGroup,
    onReorderCards,
    transactionsRefreshing,
    groupByType,
    visibleFeaturedCards,
    referenceDate,
    allowHideCards,
  ]);

  const cardNameById = useMemo(
    () => new Map(cards.map((card) => [card.id, card.name])),
    [cards],
  );
  const namedHiddenCards = hiddenCards
    .filter((entry) => cardNameById.has(entry.cardId))
    .map((entry) => ({
      cardId: entry.cardId,
      name: cardNameById.get(entry.cardId) as string,
    }));

  return (
    <div className="space-y-3 mb-8">
      {transactionsRefreshing && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 py-2 px-4 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Refreshing YNAB data…</span>
        </div>
      )}

      {!isInitialLoading && hasVisibleCards && (
        <DashboardStatusSummary
          cards={visibleFeaturedCards}
          cardMetricsById={cardMetricsById}
          settings={settings}
          hiddenCards={namedHiddenCards}
          onUnhideCard={onUnhideCard}
          onUnhideAll={handleShowAll}
        />
      )}

      {summaryContent}
    </div>
  );
}

interface CardGroupProps {
  category: "cashback" | "miles" | "all";
  title: string;
  icon: ReactNode;
  cards: CreditCard[];
  cardMetricsById: Record<string, PrefetchedCardMetrics>;
  flagNames: Partial<Record<YnabFlagColor, string>>;
  settings: AppSettings;
  summaryViewSubcategoriesExpanded?: SummaryViewSubcategoriesPreference;
  viewMode: DashboardViewMode;
  pat: string;
  prefetchedTransactions: Transaction[];
  onToggleSummarySubcategories(cardId: string): void;
  onHideCard(cardId: string, hiddenUntil: string): void;
  isCollapsed: boolean;
  onToggleCollapse(): void;
  onReorderCards(orderedIds: string[]): void;
  isRefreshing: boolean;
  showTypeBadge?: boolean;
  referenceDate?: Date;
  allowHideCards: boolean;
  SortableGrid: SortableGridComponent | null;
}

function CardGroup({
  category,
  title,
  icon,
  cards,
  cardMetricsById,
  flagNames,
  settings,
  summaryViewSubcategoriesExpanded,
  viewMode,
  pat,
  prefetchedTransactions,
  onToggleSummarySubcategories,
  onHideCard,
  isCollapsed,
  onToggleCollapse,
  onReorderCards,
  isRefreshing,
  showTypeBadge = false,
  referenceDate,
  allowHideCards,
  SortableGrid,
}: CardGroupProps) {
  const contentId = `${category}-card-group`;
  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

  const isAllCategory = category === "all";
  const canReorder = cards.length > 1;

  return (
    <section className={isAllCategory ? "" : "space-y-2.5"}>
      {!isAllCategory && (
        <div className="flex items-center gap-2">
          <h2 className="flex items-center text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!isCollapsed}
              aria-controls={contentId}
              className="flex items-center gap-1.5 text-left transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md px-1 py-1"
            >
              <ChevronIcon className="h-4 w-4" aria-hidden="true" />
              {icon}
              <span>{title}</span>
            </button>
          </h2>
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums"
          >
            {cards.length}
          </Badge>
        </div>
      )}

      {(isAllCategory || !isCollapsed) &&
        cards.length > 0 &&
        (SortableGrid && canReorder ? (
          <SortableGrid
            cards={cards}
            cardMetricsById={cardMetricsById}
            contentId={contentId}
            flagNames={flagNames}
            settings={settings}
            summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onToggleSummarySubcategories={onToggleSummarySubcategories}
            onHideCard={onHideCard}
            onReorderCards={onReorderCards}
            isRefreshing={isRefreshing}
            showTypeBadge={showTypeBadge}
            referenceDate={referenceDate}
            allowHideCard={allowHideCards}
          />
        ) : (
          <StaticDashboardCardGrid
            cards={cards}
            cardMetricsById={cardMetricsById}
            contentId={contentId}
            flagNames={flagNames}
            settings={settings}
            summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onToggleSummarySubcategories={onToggleSummarySubcategories}
            onHideCard={onHideCard}
            isRefreshing={isRefreshing}
            showTypeBadge={showTypeBadge}
            referenceDate={referenceDate}
            allowHideCard={allowHideCards}
            showGripHandle={canReorder}
          />
        ))}

      {isCollapsed && (
        <div id={contentId} className="hidden" aria-hidden="true" />
      )}
    </section>
  );
}

interface StaticDashboardCardGridProps {
  cards: CreditCard[];
  cardMetricsById: Record<string, PrefetchedCardMetrics>;
  contentId: string;
  flagNames: Partial<Record<YnabFlagColor, string>>;
  settings: AppSettings;
  summaryViewSubcategoriesExpanded?: SummaryViewSubcategoriesPreference;
  viewMode: DashboardViewMode;
  pat: string;
  prefetchedTransactions: Transaction[];
  onToggleSummarySubcategories(cardId: string): void;
  onHideCard(cardId: string, hiddenUntil: string): void;
  isRefreshing: boolean;
  showTypeBadge?: boolean;
  referenceDate?: Date;
  allowHideCard: boolean;
  showGripHandle?: boolean;
}

function StaticDashboardCardGrid({
  cards,
  cardMetricsById,
  contentId,
  flagNames,
  settings,
  summaryViewSubcategoriesExpanded,
  viewMode,
  pat,
  prefetchedTransactions,
  onToggleSummarySubcategories,
  onHideCard,
  isRefreshing,
  showTypeBadge = false,
  referenceDate,
  allowHideCard,
  showGripHandle = false,
}: StaticDashboardCardGridProps) {
  return (
    <div
      id={contentId}
      className={cn(
        "grid gap-4",
        viewMode === "detailed"
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {cards.map((card) => (
        <DashboardCardTile
          key={card.id}
          card={card}
          flagNames={flagNames}
          metrics={cardMetricsById[card.id]}
          settings={settings}
          summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
          viewMode={viewMode}
          pat={pat}
          prefetchedTransactions={prefetchedTransactions}
          onToggleSummarySubcategories={onToggleSummarySubcategories}
          onHideCard={onHideCard}
          isRefreshing={isRefreshing}
          showTypeBadge={showTypeBadge}
          referenceDate={referenceDate}
          allowHideCard={allowHideCard}
          dragHandle={
            showGripHandle ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-none rounded-tl-lg border-l border-t border-border/70 bg-background/80 backdrop-blur-sm px-0 text-muted-foreground cursor-grab hover:cursor-grab active:cursor-grabbing touch-none select-none shadow-sm hover:bg-background/95 hover:text-foreground"
                aria-label={`Reorder ${card.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <GripVertical
                  className="h-4 w-4 pointer-events-none"
                  aria-hidden="true"
                />
              </Button>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
