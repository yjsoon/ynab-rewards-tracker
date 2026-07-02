"use client";

import { Fragment, useState } from "react";
import { ChevronDown, EyeOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/CurrencyAmount";
import { cn } from "@/lib/utils";
import {
  getCardAttentionStatus,
  type CardAttentionStatus,
  type PrefetchedCardMetrics,
} from "@/lib/card-metrics";
import type { AppSettings, CreditCard } from "@/lib/storage";

export interface HiddenCardEntry {
  cardId: string;
  name: string;
}

interface DashboardStatusSummaryProps {
  cards: CreditCard[];
  cardMetricsById: Record<string, PrefetchedCardMetrics>;
  settings: AppSettings;
  hiddenCards?: HiddenCardEntry[];
  onUnhideCard?: (cardId: string) => void;
  onUnhideAll?: () => void;
}

interface StatusSlot {
  key: CardAttentionStatus;
  describe: (count: number) => string;
  dotClass: string;
  textClass: string;
}

// Lifecycle order: working towards the minimum, earning, approaching the cap, done.
const STATUS_SLOTS: StatusSlot[] = [
  {
    key: "below-minimum",
    describe: (count) => `${count} below minimum spend`,
    dotClass: "bg-sky-500",
    textClass: "text-sky-700 dark:text-sky-300",
  },
  {
    key: "earning",
    describe: (count) => `${count} earning rewards`,
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "near-cap",
    describe: (count) => `${count} near cap`,
    dotClass: "bg-amber-500",
    textClass: "text-amber-700 dark:text-amber-300",
  },
  {
    key: "at-cap",
    describe: (count) => `${count} at cap`,
    dotClass: "bg-red-500",
    textClass: "text-red-700 dark:text-red-300",
  },
];

export function DashboardStatusSummary({
  cards,
  cardMetricsById,
  settings,
  hiddenCards = [],
  onUnhideCard,
  onUnhideAll,
}: DashboardStatusSummaryProps) {
  const [hiddenOpen, setHiddenOpen] = useState(false);

  const counts: Record<CardAttentionStatus, number> = {
    "at-cap": 0,
    "near-cap": 0,
    "below-minimum": 0,
    earning: 0,
    "no-limits": 0,
  };
  let earnedDollars = 0;
  let metricsCount = 0;

  cards.forEach((card) => {
    const metrics = cardMetricsById[card.id];
    if (!metrics) {
      return;
    }
    metricsCount += 1;
    counts[getCardAttentionStatus(card, metrics.calculation)] += 1;
    earnedDollars += metrics.calculation.rewardEarnedDollars ?? 0;
  });

  if (metricsCount === 0) {
    return null;
  }

  // Cards without limits earn unconditionally, so fold them into the earning slot.
  counts.earning += counts["no-limits"];

  const clusterLabel = STATUS_SLOTS.map((slot) => slot.describe(counts[slot.key])).join(", ");
  const showHidden = hiddenCards.length > 0 && !!onUnhideCard;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span
          className="inline-flex items-center gap-1.5 font-semibold tabular-nums"
          role="img"
          aria-label={clusterLabel}
          title={clusterLabel}
        >
          {STATUS_SLOTS.map((slot, index) => {
            const count = counts[slot.key];
            return (
              <Fragment key={slot.key}>
                {index > 0 && (
                  <span className="font-normal text-muted-foreground/40" aria-hidden="true">
                    /
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    count === 0 ? "text-muted-foreground/50" : slot.textClass
                  )}
                  title={slot.describe(count)}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      slot.dotClass,
                      count === 0 && "opacity-40"
                    )}
                    aria-hidden="true"
                  />
                  {count}
                </span>
              </Fragment>
            );
          })}
        </span>
        {showHidden && (
          <button
            type="button"
            onClick={() => setHiddenOpen((open) => !open)}
            aria-expanded={hiddenOpen}
            aria-controls="dashboard-hidden-cards"
            className="inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <EyeOff className="h-3 w-3" aria-hidden="true" />
            {hiddenCards.length} hidden
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                hiddenOpen && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>
        )}
        <span
          className="ml-auto text-muted-foreground"
          title="Estimated rewards earned this period across visible cards, with miles converted to dollars"
        >
          ≈ <CurrencyAmount value={earnedDollars} currency={settings.currency} decimals={0} /> earned
          this period
        </span>
      </div>

      {showHidden && (
        <div
          id="dashboard-hidden-cards"
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            hiddenOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px]">
              <span className="text-muted-foreground">Hidden until next cycle:</span>
              {hiddenCards.map((entry) => (
                <button
                  key={entry.cardId}
                  type="button"
                  onClick={() => onUnhideCard?.(entry.cardId)}
                  title={`Show ${entry.name} again`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {entry.name}
                  <X
                    className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              ))}
              {hiddenCards.length > 1 && onUnhideAll && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={onUnhideAll}
                >
                  Show all
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
