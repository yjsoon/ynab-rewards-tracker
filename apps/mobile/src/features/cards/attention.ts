import {
  summariseMonthlyQualificationProgress,
  type CardDashboardProjection,
} from '@ynab-counter/app-core/rewards-engine';
import { parseYnabDate } from '@ynab-counter/app-core/rewards-engine/date-utils';

const MS_PER_DAY = 86_400_000;

export type CardAttentionStatus =
  | 'qualification-failed'
  | 'below-minimum'
  | 'earning'
  | 'near-cap'
  | 'at-cap'
  | 'no-limits';

export interface QualificationRowModel {
  tone: 'positive' | 'attention' | 'destructive';
  label: string;
}

export function cardAttentionStatus(
  projection: CardDashboardProjection,
): CardAttentionStatus {
  if (projection.calculation.qualificationStatus === 'failed') {
    return 'qualification-failed';
  }
  switch (projection.status) {
    case 'capped':
      return 'at-cap';
    case 'near_cap':
      return 'near-cap';
    case 'building':
      return 'below-minimum';
    case 'earning':
      return 'earning';
    case 'open':
    case 'unconfigured':
      return 'no-limits';
  }
}

export function daysLeftInPeriod(periodEnd: string, referenceDate: Date): number {
  return Math.max(
    0,
    Math.ceil((parseYnabDate(periodEnd).getTime() - referenceDate.getTime()) / MS_PER_DAY),
  );
}

export function qualificationRow(
  projection: CardDashboardProjection,
  formatting: { currencyRounded: (value: number) => string },
): QualificationRowModel | null {
  const months = projection.calculation.monthlyQualifications ?? [];
  const monthlyMinimum = projection.calculation.monthlyMinimumSpend ?? 0;
  if (!projection.card.rewardPeriod || monthlyMinimum <= 0 || months.length === 0) {
    return null;
  }

  const asOf = projection.calculationPeriod.asOf ?? projection.calculationPeriod.end;
  const active = months.find((month) => month.start <= asOf && month.end >= asOf)
    ?? months.find((month) => month.status === 'pending');
  if (!active) {
    return null;
  }

  const status = projection.calculation.qualificationStatus;
  const progress = summariseMonthlyQualificationProgress(
    months,
    projection.card.rewardPeriod.monthCount ?? months.length,
  );

  if (progress.allMet) {
    return {
      tone: 'positive',
      label: `All ${progress.monthCount} monthly minimums met`,
    };
  }

  const spend = formatting.currencyRounded(active.spend);
  const target = formatting.currencyRounded(monthlyMinimum);
  const thisMonth = `This month: ${spend} of ${target}`;
  const label = progress.tally ? `${thisMonth} · ${progress.tally}` : thisMonth;

  if (status === 'failed') {
    return { tone: 'destructive', label };
  }
  if (status === 'met') {
    return { tone: 'positive', label };
  }
  return { tone: 'attention', label };
}
