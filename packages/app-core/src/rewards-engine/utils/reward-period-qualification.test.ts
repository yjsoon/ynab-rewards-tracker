import { describe, expect, it } from 'vitest';

import type { MonthlyQualificationBreakdown } from '../../storage/types';
import {
  evaluateRewardPeriodQualification,
  getRewardPeriodMinimumScope,
  isWholePeriodMinimum,
} from './reward-period-qualification';

const months: MonthlyQualificationBreakdown[] = [
  { start: '2026-01-01', end: '2026-01-31', spend: 400, minimumSpend: 1000, status: 'pending' },
  { start: '2026-02-01', end: '2026-02-28', spend: 200, minimumSpend: 1000, status: 'pending' },
  { start: '2026-03-01', end: '2026-03-31', spend: 0, minimumSpend: 1000, status: 'pending' },
];

describe('getRewardPeriodMinimumScope', () => {
  it('defaults omitted and unknown values to each month', () => {
    expect(getRewardPeriodMinimumScope(undefined)).toBe('each_month');
    expect(getRewardPeriodMinimumScope({})).toBe('each_month');
    expect(isWholePeriodMinimum({ minimumScope: 'whole_period' })).toBe(true);
  });
});

describe('evaluateRewardPeriodQualification', () => {
  it('fails a completed short month when the minimum is monthly', () => {
    const result = evaluateRewardPeriodQualification({
      scope: 'each_month',
      months,
      asOf: '2026-02-15',
      today: '2026-02-15',
    });

    expect(result.status).toBe('failed');
    expect(result.months[0].status).toBe('failed');
    expect(result.progress).toBe(20);
  });

  it('keeps a short first month pending when the minimum is one pot over the period', () => {
    const result = evaluateRewardPeriodQualification({
      scope: 'whole_period',
      months,
      asOf: '2026-02-15',
      today: '2026-02-15',
    });

    expect(result.status).toBe('pending');
    expect(result.periodSpend).toBe(600);
    expect(result.progress).toBe(60);
    expect(result.months.every((month) => month.status === 'pending')).toBe(true);
  });

  it('meets a period minimum as soon as the pot is full', () => {
    const result = evaluateRewardPeriodQualification({
      scope: 'whole_period',
      months: [
        { ...months[0], spend: 700 },
        { ...months[1], spend: 400 },
        months[2],
      ],
      asOf: '2026-02-15',
      today: '2026-02-15',
    });

    expect(result.status).toBe('met');
    expect(result.periodSpend).toBe(1100);
  });

  it('fails a period minimum only after the last month closes short', () => {
    const result = evaluateRewardPeriodQualification({
      scope: 'whole_period',
      months: [
        { ...months[0], spend: 400 },
        { ...months[1], spend: 200 },
        { ...months[2], spend: 100 },
      ],
      asOf: '2026-04-01',
      today: '2026-04-01',
    });

    expect(result.status).toBe('failed');
    expect(result.periodSpend).toBe(700);
  });
});
