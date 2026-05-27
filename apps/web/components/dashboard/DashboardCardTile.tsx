"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  DollarSign,
  EyeOff,
  MoreHorizontal,
  Plane,
  ReceiptText,
  Settings2,
  Sparkles,
} from "lucide-react";

import type {
  AppSettings,
  CreditCard,
  DashboardViewMode,
  SummaryViewSubcategoriesPreference,
} from "@/lib/storage";
import type { YnabFlagColor } from "@/lib/ynab-constants";
import type { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";
import { SimpleRewardsCalculator } from "@/lib/rewards-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CardSummaryCompact,
  CardSummaryCompactContent,
} from "@/components/CardSummaryCompact";
import { hasMinimumSpendRequirement } from "@/lib/minimum-spend-helpers";
import type { PrefetchedCardMetrics } from "@/lib/card-metrics";

const isExpansionMap = (
  value: SummaryViewSubcategoriesPreference | undefined,
): value is Record<string, boolean> =>
  value !== undefined &&
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

export interface DashboardCardTileProps {
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
  isSorting?: boolean;
  isDragging?: boolean;
  isRefreshing: boolean;
  showTypeBadge?: boolean;
  referenceDate?: Date;
  allowHideCard: boolean;
  dragHandle?: ReactNode;
}

export function DashboardCardTile({
  card,
  flagNames,
  metrics,
  settings,
  summaryViewSubcategoriesExpanded,
  pat,
  prefetchedTransactions,
  onToggleSummarySubcategories,
  onHideCard,
  isSorting = false,
  isDragging = false,
  isRefreshing,
  referenceDate,
  allowHideCard,
  dragHandle,
}: DashboardCardTileProps) {
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
    [handleNavigate],
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

  const accentClasses =
    "border border-border/70 dark:border-border/50 hover:border-primary/40";
  const isSubcategoryExpanded = isExpansionMap(summaryViewSubcategoriesExpanded)
    ? (summaryViewSubcategoriesExpanded[card.id] ?? false)
    : Boolean(summaryViewSubcategoriesExpanded);

  // Header reward chip — shows the dollar/flight icon plus this period's earned reward, rounded
  // to the nearest dollar (cashback) or whole mile (miles). Colour reflects card state.
  const calc = metrics?.calculation;
  const minimumMet = calc ? calc.minimumSpendMet : true;
  const hasMin = calc ? hasMinimumSpendRequirement(calc.minimumSpend) : false;
  const exceeded = calc?.maximumSpendExceeded ?? false;
  const earnedNumber = calc?.rewardEarned ?? 0;
  const earnedDisplay = Math.round(earnedNumber).toLocaleString();
  const rewardChipState: "exceeded" | "warn" | "muted" = exceeded
    ? "exceeded"
    : hasMin && !minimumMet
      ? "warn"
      : "muted";
  const rewardChipClass = {
    exceeded: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
    muted: card.type === "cashback"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-blue-700 dark:text-blue-400",
  }[rewardChipState];

  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`View details for ${card.name}`}
      className={cn(
        "group relative overflow-hidden flex flex-col h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg",
        "bg-card",
        accentClasses,
        exceeded ? "ring-2 ring-red-300/70 dark:ring-red-900/60" : undefined,
        isDragging ? "ring-2 ring-primary/60 shadow-lg" : undefined,
      )}
      onClick={() => {
        if (!suppressClickRef.current) {
          handleNavigate();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute top-0 right-0 z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none rounded-bl-lg border-l border-b border-border/70 bg-background/80 backdrop-blur-sm px-0 text-muted-foreground shadow-sm hover:bg-background/95 hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label="Card actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `/cards/${card.id}?edit=1`;
              }}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Edit settings
            </DropdownMenuItem>
            {allowHideCard && (
              <DropdownMenuItem
                onClick={() => {
                  const period = SimpleRewardsCalculator.calculatePeriod(
                    card,
                    referenceDate,
                  );
                  onHideCard(card.id, period.end);
                }}
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Hide from dashboard
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `/cards/${card.id}`;
              }}
            >
              <ReceiptText className="h-4 w-4 mr-2" />
              View transactions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {dragHandle ? (
        <div className="absolute bottom-0 right-0 z-20">{dragHandle}</div>
      ) : null}

      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2 pr-4">
          <CardTitle
            title={card.name}
            className="min-w-0 flex-1 truncate text-[0.95rem] sm:text-base"
          >
            {card.name}
          </CardTitle>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {card.promotionalPeriod && (
              <Badge
                variant="secondary"
                className="shrink-0 h-5 px-1.5 gap-1 bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300"
                aria-label={`Promotional period${card.promotionalPeriod.startDate ? ` from ${card.promotionalPeriod.startDate}` : ""} until ${card.promotionalPeriod.endDate}`}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span className="text-[0.65rem] font-medium">Promo</span>
              </Badge>
            )}
            {exceeded && (
              <Badge
                variant="outline"
                className="shrink-0 h-5 px-1.5 gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                <span className="text-[0.65rem] font-medium">At cap</span>
              </Badge>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                rewardChipClass,
              )}
              title={
                card.type === "cashback"
                  ? `Earned this period: $${earnedNumber.toFixed(2)}`
                  : `Earned this period: ${Math.round(earnedNumber).toLocaleString()} miles`
              }
              aria-label={
                card.type === "cashback"
                  ? `Earned $${earnedDisplay} cashback`
                  : `Earned ${earnedDisplay} miles`
              }
            >
              {card.type === "cashback" ? (
                <DollarSign className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Plane className="h-3.5 w-3.5" aria-hidden />
              )}
              <span>{earnedDisplay}</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {metrics ? (
          <CardSummaryCompactContent
            card={card}
            flagNames={flagNames}
            isRefreshing={isRefreshing}
            isSubcategoryExpanded={isSubcategoryExpanded}
            metrics={metrics}
            onHideCard={onHideCard}
            onToggleSubcategories={() => onToggleSummarySubcategories(card.id)}
            settings={settings}
            allowHideCard={allowHideCard}
          />
        ) : (
          <CardSummaryCompact
            card={card}
            pat={pat}
            prefetchedTransactions={prefetchedTransactions}
            onHideCard={onHideCard}
            isRefreshing={isRefreshing}
            referenceDate={referenceDate}
            allowHideCard={allowHideCard}
          />
        )}
      </CardContent>
    </Card>
  );
}
