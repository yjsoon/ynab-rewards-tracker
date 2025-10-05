"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useMemo, useCallback } from "react";
import { CreditCard as CreditCardIcon, Percent, Settings2, TrendingUp } from "lucide-react";

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
            title="Cashback Cards"
            icon={<Percent className="h-5 w-5 text-green-600" aria-hidden="true" />}
            cards={cashbackCards}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onHideCard={onHideCard}
          />
        )}
        {milesCards.length > 0 && (
          <CardGroup
            title="Miles Cards"
            icon={<TrendingUp className="h-5 w-5 text-blue-600" aria-hidden="true" />}
            cards={milesCards}
            viewMode={viewMode}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onHideCard={onHideCard}
          />
        )}
      </>
    );
  }, [cards.length, hasVisibleCards, cashbackCards, viewMode, pat, prefetchedTransactions, onHideCard, milesCards, hiddenCount, handleShowAll]);

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
  title: string;
  icon: ReactNode;
  cards: CreditCard[];
  viewMode: DashboardViewMode;
  pat: string;
  prefetchedTransactions: Transaction[];
  onHideCard(cardId: string, hiddenUntil: string): void;
}

function CardGroup({ title, icon, cards, viewMode, pat, prefetchedTransactions, onHideCard }: CardGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
        <Badge variant="secondary">{cards.length}</Badge>
      </div>
      <div
        className={cn(
          "grid gap-4",
          viewMode === "detailed"
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        )}
      >
        {cards.map((card) => {
          const accentClasses = "border border-border/70 dark:border-border/50 hover:border-primary/40";

          return (
            <Link key={card.id} href={`/cards/${card.id}`} className="block group">
              <Card
                className={cn(
                  "relative overflow-hidden flex flex-col h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  "bg-card",
                  accentClasses
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
          );
        })}
      </div>
    </div>
  );
}
