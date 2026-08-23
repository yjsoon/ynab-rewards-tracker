import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';
import { parseYnabDate } from '@ynab-counter/app-core/rewards-engine/date-utils';
import {
  isWholePeriodMinimum,
  sumQualificationSpend,
} from '@ynab-counter/app-core/rewards-engine/utils/reward-period-qualification';

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
  if (status === 'failed') {
    return { tone: 'destructive', label: 'Period qualification failed' };
  }

  const usesPeriodMinimum = isWholePeriodMinimum(projection.card.rewardPeriod);
  const target = formatting.currencyRounded(monthlyMinimum);
  if (usesPeriodMinimum) {
    const spend = formatting.currencyRounded(sumQualificationSpend(months));
    if (status === 'met') {
      return { tone: 'positive', label: `Period: ${spend} of ${target} · met` };
    }
    return { tone: 'attention', label: `Period: ${spend} of ${target}` };
  }

  const allMet = months.every((month) => month.status === 'met');
  if (status === 'met' && allMet) {
    const monthCount = projection.card.rewardPeriod.monthCount ?? months.length;
    return {
      tone: 'positive',
      label: `All ${monthCount} monthly minimums met`,
    };
  }

  const spend = formatting.currencyRounded(active.spend);
  if (status === 'met') {
    return {
      tone: 'positive',
      label: `This month: ${spend} of ${target} · met`,
    };
  }
  return {
    tone: 'attention',
    label: `This month: ${spend} of ${target}`,
  };
}
