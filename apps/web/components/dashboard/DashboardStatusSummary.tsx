"use client";

import { CurrencyAmount } from "@/components/CurrencyAmount";
import { cn } from "@/lib/utils";
import {
  getCardAttentionStatus,
  type CardAttentionStatus,
  type PrefetchedCardMetrics,
} from "@/lib/card-metrics";
import type { AppSettings, CreditCard } from "@/lib/storage";

interface DashboardStatusSummaryProps {
  cards: CreditCard[];
  cardMetricsById: Record<string, PrefetchedCardMetrics>;
  settings: AppSettings;
}

interface StatusChip {
  key: CardAttentionStatus;
  label: (count: number) => string;
  dotClass: string;
  textClass: string;
}

const STATUS_CHIPS: StatusChip[] = [
  {
    key: "at-cap",
    label: (count) => `${count} at cap`,
    dotClass: "bg-red-500",
    textClass: "text-red-700 dark:text-red-300",
  },
  {
    key: "near-cap",
    label: (count) => `${count} near cap`,
    dotClass: "bg-amber-500",
    textClass: "text-amber-700 dark:text-amber-300",
  },
  {
    key: "below-minimum",
    label: (count) => `${count} below min`,
    dotClass: "bg-sky-500",
    textClass: "text-sky-700 dark:text-sky-300",
  },
  {
    key: "earning",
    label: (count) => `${count} earning`,
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700 dark:text-emerald-300",
  },
];

export function DashboardStatusSummary({
  cards,
  cardMetricsById,
  settings,
}: DashboardStatusSummaryProps) {
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

  // Cards without limits earn unconditionally, so fold them into the earning chip.
  const displayCounts = {
    ...counts,
    earning: counts.earning + counts["no-limits"],
  };
  const chips = STATUS_CHIPS.filter((chip) => displayCounts[chip.key] > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 py-0.5 font-medium tabular-nums",
            chip.textClass
          )}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", chip.dotClass)}
            aria-hidden="true"
          />
          {chip.label(displayCounts[chip.key])}
        </span>
      ))}
      <span
        className="ml-auto text-muted-foreground"
        title="Estimated rewards earned this period across visible cards, with miles converted to dollars"
      >
        ≈ <CurrencyAmount value={earnedDollars} currency={settings.currency} decimals={0} /> earned
        this period
      </span>
    </div>
  );
}
