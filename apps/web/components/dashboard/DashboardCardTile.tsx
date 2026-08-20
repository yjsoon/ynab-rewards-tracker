"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
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
import { resolveCardSpendingTier, SimpleRewardsCalculator } from "@/lib/rewards-engine";
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
import { getCardAttentionStatus } from "@/lib/card-metrics";
import type { PrefetchedCardMetrics } from "@/lib/card-metrics";
import { formatDateValue } from "@/lib/dashboard-period";

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
  isDragging = false,
  isRefreshing,
  referenceDate,
  allowHideCard,
  dragHandle,
}: DashboardCardTileProps) {
  const router = useRouter();
  const accentClasses =
    "border border-border/70 dark:border-border/50";
  const isSubcategoryExpanded = isExpansionMap(summaryViewSubcategoriesExpanded)
    ? (summaryViewSubcategoriesExpanded[card.id] ?? false)
    : Boolean(summaryViewSubcategoriesExpanded);
  const transactionsHref = `/cards/${card.id}/transactions?${new URLSearchParams({
    asOf: formatDateValue(referenceDate ?? new Date()),
    from: "dashboard",
    scope: "period",
  }).toString()}`;

  // Header reward chip — shows the dollar/flight icon plus this period's earned reward, rounded
  // to the nearest dollar (cashback) or whole mile (miles). Colour reflects card state.
  const calc = metrics?.calculation;
  const minimumMet = calc ? calc.minimumSpendMet : true;
  const hasMin = calc ? hasMinimumSpendRequirement(calc.minimumSpend) : false;
  const resolvedSpendingTier = calc
    ? resolveCardSpendingTier(card, calc.totalSpend)
    : null;
  const canUnlockHigherLevel = resolvedSpendingTier?.hasNextSpendingTier ?? false;
  const exceeded = Boolean(calc?.maximumSpendExceeded && !canUnlockHigherLevel);
  const intermediateCapReached = Boolean(
    calc?.maximumSpendExceeded && canUnlockHigherLevel,
  );
  const nearCap = calc ? getCardAttentionStatus(card, calc) === "near-cap" : false;
  const qualificationFailed = calc?.qualificationStatus === "failed";
  const earnedNumber = calc?.rewardEarned ?? 0;
  const earnedDisplay = Math.round(earnedNumber).toLocaleString();
  const rewardChipState: "exceeded" | "warn" | "muted" = exceeded || qualificationFailed
    ? "exceeded"
    : intermediateCapReached
      || calc?.qualificationStatus === "pending"
      || (hasMin && !minimumMet)
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
      className={cn(
        "group relative overflow-hidden flex flex-col h-full",
        "bg-card",
        accentClasses,
        exceeded || qualificationFailed
          ? "ring-2 ring-red-300/70 dark:ring-red-900/60"
          : undefined,
        nearCap || intermediateCapReached
          ? "ring-2 ring-amber-300/70 dark:ring-amber-800/60"
          : undefined,
        isDragging ? "ring-2 ring-primary/60 shadow-lg" : undefined,
      )}
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
                router.push(`/cards/${card.id}?edit=1`);
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
                  const [year, month, day] = period.end.split('-').map(Number);
                  onHideCard(card.id, formatDateValue(new Date(year, month - 1, day + 1)));
                }}
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Hide from dashboard
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                router.push(`/cards/${card.id}`);
              }}
            >
              <ReceiptText className="h-4 w-4 mr-2" />
              View card details
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
            className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight sm:text-[0.95rem]"
          >
            <Link
              href={transactionsHref}
              className="rounded-sm underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {card.name}
            </Link>
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
      <CardContent
        className={cn(
          "flex-1 flex flex-col",
          // Keep the last content row clear of the corner drag handle overlay
          dragHandle && "pb-9",
        )}
      >
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
            transactionsHref={transactionsHref}
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
            transactionsHref={transactionsHref}
          />
        )}
      </CardContent>
    </Card>
  );
}
