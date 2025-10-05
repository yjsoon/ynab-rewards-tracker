"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CreditCard as CreditCardIcon,
  GripVertical,
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
  cashbackCollapsed,
  milesCollapsed,
  onToggleGroup,
  onReorderCards,
}: DashboardCardOverviewProps) {
  const hiddenCount = hiddenCards.length;
  const hasVisibleCards = visibleFeaturedCards.length > 0;

  const handleShowAll = useCallback(() => {
    onUnhideAll();
  }, [onUnhideAll]);

  const handleViewChange = useCallback(
    (mode: DashboardViewMode) => () => onViewModeChange(mode),
    [onViewModeChange]
  );

  const summaryContent = useMemo(() => {
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
          />
        )}
      </>
    );
  }, [
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
  ]);

  return (
    <div className="space-y-8 mb-8">
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
}: CardGroupProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const items = useMemo(() => cards.map((card) => card.id), [cards]);
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
      onReorderCards(reordered);
    },
    [items, onReorderCards]
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          className="flex items-center gap-2 text-left text-xl font-semibold transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md px-1 py-1"
        >
          <ChevronIcon className="h-5 w-5" aria-hidden="true" />
          {icon}
          <span>{title}</span>
        </button>
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
              {cards.map((card) => (
                <SortableDashboardCard
                  key={card.id}
                  card={card}
                  viewMode={viewMode}
                  pat={pat}
                  prefetchedTransactions={prefetchedTransactions}
                  onHideCard={onHideCard}
                  isSorting={Boolean(activeDragId)}
                />
              ))}
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
}

function SortableDashboardCard({ card, viewMode, pat, prefetchedTransactions, onHideCard, isSorting }: SortableDashboardCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const suppressClickRef = useRef(false);

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
      <Link
        href={`/cards/${card.id}`}
        className="block group"
        draggable={false}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <Card
          className={cn(
            "relative overflow-hidden flex flex-col h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg",
            "bg-card",
            accentClasses,
            isDragging ? "ring-2 ring-primary/60 shadow-lg" : undefined
          )}
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
              />
            ) : (
              <CardSummaryCompact
                card={card}
                pat={pat}
                prefetchedTransactions={prefetchedTransactions}
                onHideCard={onHideCard}
              />
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
