"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CreditCard as CreditCardIcon,
  GripVertical,
  Loader2,
  Percent,
  Settings2,
  TrendingUp,
} from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type {
  CreditCard,
  DashboardViewMode,
  HiddenCard,
} from "@/lib/storage";
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
import { CardSpendingSummary } from "@/components/CardSpendingSummary";
import { CardSummaryCompact } from "@/components/CardSummaryCompact";

function DashboardCardSkeleton({ viewMode }: { viewMode: DashboardViewMode }) {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="h-5 bg-muted rounded w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        {viewMode === 'detailed' ? (
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
  cashbackCards: CreditCard[];
  milesCards: CreditCard[];
  visibleFeaturedCards: CreditCard[];
  hiddenCards: HiddenCard[];
  viewMode: DashboardViewMode;
  onViewModeChange(mode: DashboardViewMode): void;
  onHideCard(cardId: string, hiddenUntil: string): void;
  onUnhideAll(): void;
  pat: string;
  prefetchedTransactions: Transaction[];
  transactionsLoading: boolean;
  transactionsRefreshing: boolean;
  hasCachedTransactions: boolean;
  transactionsLastUpdatedAt: string | null;
  cashbackCollapsed: boolean;
  milesCollapsed: boolean;
  onToggleGroup(category: 'cashback' | 'miles'): void;
  onReorderCards(category: 'cashback' | 'miles', orderedIds: string[]): void;
}

function createSettingsClickHandler(cardId: string) {
  return (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.location.href = `/cards/${cardId}?tab=settings&edit=1`;
  };
}

export function DashboardCardOverview({
  cards,
  cashbackCards,
  milesCards,
  visibleFeaturedCards,
  hiddenCards,
  viewMode,
  onViewModeChange,
  onHideCard,
  onUnhideAll,
  pat,
  prefetchedTransactions,
  transactionsLoading,
  transactionsRefreshing,
  hasCachedTransactions,
  transactionsLastUpdatedAt,
  cashbackCollapsed,
  milesCollapsed,
  onToggleGroup,
  onReorderCards,
}: DashboardCardOverviewProps) {
  const hiddenCount = hiddenCards.length;
  const hasVisibleCards = visibleFeaturedCards.length > 0;

  const isInitialLoading = transactionsLoading && !hasCachedTransactions;

  const formattedTime = useMemo(() => {
    if (!transactionsLastUpdatedAt) return null;
    try {
      const date = new Date(transactionsLastUpdatedAt);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [transactionsLastUpdatedAt]);

  const handleShowAll = useCallback(() => {
    onUnhideAll();
  }, [onUnhideAll]);

  const handleViewChange = useCallback(
    (mode: DashboardViewMode) => () => onViewModeChange(mode),
    [onViewModeChange]
  );

  const summaryContent = useMemo(() => {
    if (isInitialLoading && visibleFeaturedCards.length > 0) {
      const skeletonCount = Math.min(visibleFeaturedCards.length, 6);
      return (
        <div
          className={cn(
            "grid gap-4",
            viewMode === "detailed"
              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
            <CardDescription>Manage your credit cards and their reward rules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <CreditCardIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <p className="text-lg mb-4 text-muted-foreground">No cards configured yet</p>
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
            <CardDescription>Hidden cards will return when their next billing cycle starts.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              {hiddenCount === 1 ? "1 card is currently hidden." : `${hiddenCount} cards are currently hidden.`}
            </p>
            <Button variant="outline" onClick={handleShowAll}>
              Show hidden cards now
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        {cashbackCards.length > 0 && (
          <CardGroup
            category="cashback"
            title="Cashback Cards"
            icon={<Percent className="h-5 w-5 text-green-600" aria-hidden="true" />}
            cards={cashbackCards}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onHideCard={onHideCard}
            isCollapsed={cashbackCollapsed}
            onToggleCollapse={() => onToggleGroup('cashback')}
            onReorderCards={(orderedIds) => onReorderCards('cashback', orderedIds)}
            isRefreshing={transactionsRefreshing}
          />
        )}
        {milesCards.length > 0 && (
          <CardGroup
            category="miles"
            title="Miles Cards"
            icon={<TrendingUp className="h-5 w-5 text-blue-600" aria-hidden="true" />}
            cards={milesCards}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onHideCard={onHideCard}
            isCollapsed={milesCollapsed}
            onToggleCollapse={() => onToggleGroup('miles')}
            onReorderCards={(orderedIds) => onReorderCards('miles', orderedIds)}
            isRefreshing={transactionsRefreshing}
          />
        )}
      </>
    );
  }, [
    isInitialLoading,
    cards.length,
    hasVisibleCards,
    cashbackCards,
    viewMode,
    pat,
    prefetchedTransactions,
    onHideCard,
    milesCards,
    hiddenCount,
    handleShowAll,
    cashbackCollapsed,
    milesCollapsed,
    onToggleGroup,
    onReorderCards,
    transactionsRefreshing,
    visibleFeaturedCards.length,
  ]);

  return (
    <div className="space-y-8 mb-8">
      {transactionsRefreshing && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 py-2 px-4 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Refreshing YNAB data…</span>
          {formattedTime && <span className="text-xs text-muted-foreground ml-2">Updated {formattedTime}</span>}
        </div>
      )}

      {!transactionsRefreshing && formattedTime && (
        <p className="text-xs text-muted-foreground text-center">Updated {formattedTime}</p>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Your Cards</h2>
          {hiddenCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{hiddenCount} hidden</Badge>
              <Button variant="outline" size="sm" onClick={handleShowAll}>
                Show all
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">View</span>
          <div className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/80 p-1 shadow-inner dark:border-border/40 dark:bg-muted/40">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "summary" ? "default" : "ghost"}
              className={cn(
                "rounded-full px-3 transition-colors",
                viewMode === "summary"
                  ? "shadow-sm"
                  : "text-muted-foreground hover:text-primary-foreground hover:bg-primary/80"
              )}
              onClick={handleViewChange("summary")}
            >
              Summary
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "detailed" ? "default" : "ghost"}
              className={cn(
                "rounded-full px-3 transition-colors",
                viewMode === "detailed"
                  ? "shadow-sm"
                  : "text-muted-foreground hover:text-primary-foreground hover:bg-primary/80"
              )}
              onClick={handleViewChange("detailed")}
            >
              Detailed
            </Button>
          </div>
        </div>
      </div>

      {summaryContent}
    </div>
  );
}

interface CardGroupProps {
  category: 'cashback' | 'miles';
  title: string;
  icon: ReactNode;
  cards: CreditCard[];
  viewMode: DashboardViewMode;
  pat: string;
  prefetchedTransactions: Transaction[];
  onHideCard(cardId: string, hiddenUntil: string): void;
  isCollapsed: boolean;
  onToggleCollapse(): void;
  onReorderCards(orderedIds: string[]): void;
  isRefreshing: boolean;
}

function CardGroup({
  category,
  title,
  icon,
  cards,
  viewMode,
  pat,
  prefetchedTransactions,
  onHideCard,
  isCollapsed,
  onToggleCollapse,
  onReorderCards,
  isRefreshing,
}: CardGroupProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const [orderedIds, setOrderedIds] = useState(() => cards.map((card) => card.id));

  useEffect(() => {
    const nextIds = cards.map((card) => card.id);
    setOrderedIds((prev) => {
      const prevKey = prev.join("|");
      const nextKey = nextIds.join("|");
      if (prevKey === nextKey) {
        return prev;
      }
      return nextIds;
    });
  }, [cards]);

  const items = orderedIds;
  const contentId = `${category}-card-group`;
  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(overId);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = arrayMove(items, oldIndex, newIndex);
      setOrderedIds(reordered);
      onReorderCards(reordered);
    },
    [items, onReorderCards]
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-controls={contentId}
            className="flex items-center gap-2 text-left transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md px-1 py-1"
          >
            <ChevronIcon className="h-5 w-5" aria-hidden="true" />
            {icon}
            <span>{title}</span>
          </button>
        </h2>
        <Badge variant="secondary">{cards.length}</Badge>
      </div>

      {!isCollapsed && cards.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveDragId(String(active.id))}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={(event) => {
            handleDragEnd(event);
            setActiveDragId(null);
          }}
        >
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <div
              id={contentId}
              className={cn(
                "grid gap-4",
                viewMode === "detailed"
                  ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              )}
            >
              {items.map((cardId) => {
                const card = cardById.get(cardId);
                if (!card) {
                  return null;
                }

                return (
                  <SortableDashboardCard
                    key={card.id}
                    card={card}
                    viewMode={viewMode}
                    pat={pat}
                    prefetchedTransactions={prefetchedTransactions}
                    onHideCard={onHideCard}
                    isSorting={Boolean(activeDragId)}
                    isRefreshing={isRefreshing}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isCollapsed && <div id={contentId} className="hidden" aria-hidden="true" />}
    </section>
  );
}

interface SortableDashboardCardProps {
  card: CreditCard;
  viewMode: DashboardViewMode;
  pat: string;
  prefetchedTransactions: Transaction[];
  onHideCard(cardId: string, hiddenUntil: string): void;
  isSorting: boolean;
  isRefreshing: boolean;
}

function SortableDashboardCard({ card, viewMode, pat, prefetchedTransactions, onHideCard, isSorting, isRefreshing }: SortableDashboardCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const suppressClickRef = useRef(false);
  const router = useRouter();

  const handleNavigate = useCallback(() => {
    router.push(`/cards/${card.id}`);
  }, [router, card.id]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!suppressClickRef.current) {
          handleNavigate();
        }
      }
    },
    [handleNavigate]
  );

  useEffect(() => {
    if (isSorting) {
      suppressClickRef.current = true;
      return;
    }

    if (typeof window === "undefined") {
      suppressClickRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [isSorting]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    style.zIndex = 50;
  }

  const accentClasses = "border border-border/70 dark:border-border/50 hover:border-primary/40";

  return (
    <div ref={setNodeRef} style={style} className="focus-visible:outline-none">
      <Card
        role="link"
        tabIndex={0}
        aria-label={`View details for ${card.name}`}
        className={cn(
          "group relative overflow-hidden flex flex-col h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg",
          "bg-card",
          accentClasses,
          isDragging ? "ring-2 ring-primary/60 shadow-lg" : undefined
        )}
        onClick={() => {
          if (!suppressClickRef.current) {
            handleNavigate();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={createSettingsClickHandler(card.id)}
            aria-label="Go to card settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="absolute bottom-3 right-3">
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-full bg-background/90 backdrop-blur px-0 cursor-grab active:cursor-grabbing shadow-sm border border-border/60 hover:bg-background"
            aria-label={`Reorder ${card.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <CardHeader className="pb-3">
          <CardTitle
            title={card.name}
            className={cn(
              viewMode === "detailed" ? "text-lg" : "text-[0.95rem] sm:text-base",
              "pr-12 truncate"
            )}
          >
            {card.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {viewMode === "detailed" ? (
            <CardSpendingSummary
              card={card}
              pat={pat}
              prefetchedTransactions={prefetchedTransactions}
              onHideCard={onHideCard}
              showHideOption
              isRefreshing={isRefreshing}
            />
          ) : (
            <CardSummaryCompact
              card={card}
              pat={pat}
              prefetchedTransactions={prefetchedTransactions}
              onHideCard={onHideCard}
              isRefreshing={isRefreshing}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
