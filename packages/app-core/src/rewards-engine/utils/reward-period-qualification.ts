import type {
  CardRewardPeriod,
  MonthlyQualificationBreakdown,
  MonthlyQualificationStatus,
  RewardPeriodMinimumScope,
  RewardQualificationStatus,
} from '../../storage/types';

export function getRewardPeriodMinimumScope(
  rewardPeriod?: Pick<CardRewardPeriod, 'minimumScope'> | null,
): RewardPeriodMinimumScope {
  return rewardPeriod?.minimumScope === 'whole_period' ? 'whole_period' : 'each_month';
}

export function isWholePeriodMinimum(
  rewardPeriod?: Pick<CardRewardPeriod, 'minimumScope'> | null,
): boolean {
  return getRewardPeriodMinimumScope(rewardPeriod) === 'whole_period';
}

export function sumQualificationSpend(
  months: readonly Pick<MonthlyQualificationBreakdown, 'spend'>[],
): number {
  return months.reduce((sum, month) => sum + month.spend, 0);
}

function isBoundaryComplete(end: string, asOf: string, today: string): boolean {
  return end < asOf || (end === asOf && asOf < today);
}

function qualifyMonth(options: {
  spend: number;
  minimumSpend: number;
  complete: boolean;
}): MonthlyQualificationStatus {
  if (options.spend >= options.minimumSpend) {
    return 'met';
  }
  return options.complete ? 'failed' : 'pending';
}

export function evaluateRewardPeriodQualification(options: {
  scope: RewardPeriodMinimumScope;
  months: readonly MonthlyQualificationBreakdown[];
  asOf: string;
  today: string;
}): {
  status: RewardQualificationStatus;
  months: MonthlyQualificationBreakdown[];
  progress?: number;
  periodSpend: number;
} {
  const periodSpend = sumQualificationSpend(options.months);

  if (options.scope === 'whole_period') {
    const lastMonth = options.months[options.months.length - 1];
    const minimumSpend = options.months[0]?.minimumSpend ?? 0;
    const periodComplete = lastMonth
      ? isBoundaryComplete(lastMonth.end, options.asOf, options.today)
      : false;
    const status: RewardQualificationStatus = periodSpend >= minimumSpend
      ? 'met'
      : periodComplete
        ? 'failed'
        : 'pending';
    const months = options.months.map((month) => ({
      ...month,
      status: 'pending' as const,
    }));
    const progress = minimumSpend > 0
      ? Math.min(100, (periodSpend / minimumSpend) * 100)
      : 100;
    return { status, months, progress, periodSpend };
  }

  const months = options.months.map((month) => ({
    ...month,
    status: qualifyMonth({
      spend: month.spend,
      minimumSpend: month.minimumSpend,
      complete: isBoundaryComplete(month.end, options.asOf, options.today),
    }),
  }));
  const startedMonths = months.filter((month) => month.start <= options.asOf);
  const status: RewardQualificationStatus = startedMonths.some((month) => month.status === 'failed')
    ? 'failed'
    : startedMonths.length > 0 && startedMonths.every((month) => month.status === 'met')
      ? 'met'
      : 'pending';
  const activeMonth = months.find((month) => month.start <= options.asOf && month.end >= options.asOf)
    ?? months.find((month) => month.status === 'pending')
    ?? months[months.length - 1];
  const progress = activeMonth && activeMonth.minimumSpend > 0
    ? Math.min(100, (activeMonth.spend / activeMonth.minimumSpend) * 100)
    : 100;
  return { status, months, progress, periodSpend };
}
