"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
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
  AppSettings,
  CreditCard,
  DashboardViewMode,
  SummaryViewSubcategoriesPreference,
} from "@/lib/storage";
import type { YnabFlagColor } from "@/lib/ynab-constants";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PrefetchedCardMetrics } from "@/lib/card-metrics";
import { DashboardCardTile } from "@/components/dashboard/DashboardCardTile";

export interface SortableDashboardCardGridProps {
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
  onReorderCards(orderedIds: string[]): void;
  isRefreshing: boolean;
  showTypeBadge?: boolean;
  referenceDate?: Date;
  allowHideCard: boolean;
}

export function SortableDashboardCardGrid({
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
  onReorderCards,
  isRefreshing,
  showTypeBadge = false,
  referenceDate,
  allowHideCard,
}: SortableDashboardCardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const cardById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const [orderedIds, setOrderedIds] = useState(() =>
    cards.map((card) => card.id),
  );

  useEffect(() => {
    const nextIds = cards.map((card) => card.id);
    setOrderedIds((previousIds) => {
      const previousKey = previousIds.join("|");
      const nextKey = nextIds.join("|");

      if (previousKey === nextKey) {
        return previousIds;
      }

      return nextIds;
    });
  }, [cards]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = orderedIds.indexOf(activeId);
      const newIndex = orderedIds.indexOf(overId);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = arrayMove(orderedIds, oldIndex, newIndex);
      setOrderedIds(reordered);
      onReorderCards(reordered);
    },
    [onReorderCards, orderedIds],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
        <div
          id={contentId}
          className={cn(
            "grid gap-4",
            viewMode === "detailed"
              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {orderedIds.map((cardId) => {
            const card = cardById.get(cardId);
            if (!card) {
              return null;
            }

            return (
              <SortableDashboardCard
                key={card.id}
                card={card}
                flagNames={flagNames}
                metrics={cardMetricsById[card.id]}
                settings={settings}
                summaryViewSubcategoriesExpanded={
                  summaryViewSubcategoriesExpanded
                }
                viewMode={viewMode}
                pat={pat}
                prefetchedTransactions={prefetchedTransactions}
                onToggleSummarySubcategories={onToggleSummarySubcategories}
                onHideCard={onHideCard}
                isRefreshing={isRefreshing}
                showTypeBadge={showTypeBadge}
                referenceDate={referenceDate}
                allowHideCard={allowHideCard}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableDashboardCardProps {
  card: CreditCard;
  flagNames: Partial<Record<YnabFlagColor, string>>;
  metrics?: PrefetchedCardMetrics;
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
}

function SortableDashboardCard({
  card,
  flagNames,
  metrics,
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
}: SortableDashboardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    style.zIndex = 50;
  }

  return (
    <div ref={setNodeRef} style={style} className="focus-visible:outline-none">
      <DashboardCardTile
        card={card}
        flagNames={flagNames}
        metrics={metrics}
        settings={settings}
        summaryViewSubcategoriesExpanded={summaryViewSubcategoriesExpanded}
        viewMode={viewMode}
        pat={pat}
        prefetchedTransactions={prefetchedTransactions}
        onToggleSummarySubcategories={onToggleSummarySubcategories}
        onHideCard={onHideCard}
        isDragging={isDragging}
        isRefreshing={isRefreshing}
        showTypeBadge={showTypeBadge}
        referenceDate={referenceDate}
        allowHideCard={allowHideCard}
        dragHandle={
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none rounded-tl-lg border-l border-t border-border/70 bg-background/80 backdrop-blur-sm px-0 text-muted-foreground cursor-grab hover:cursor-grab active:cursor-grabbing touch-none select-none shadow-sm hover:bg-background/95 hover:text-foreground"
            aria-label={`Reorder ${card.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            {...attributes}
            {...listeners}
          >
            <GripVertical
              className="h-4 w-4 pointer-events-none"
              aria-hidden="true"
            />
          </Button>
        }
      />
    </div>
  );
}
