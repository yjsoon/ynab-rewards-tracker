import { describe, expect, it } from 'vitest';
import {
  formatDateValue,
  parseDateValue,
  resolveDashboardPeriod,
  shiftDashboardPeriodDays,
  shiftDashboardPeriodMonths,
} from './dashboard-period';

const NOW = new Date(2026, 7, 14, 13, 30, 0);

describe('parseDateValue', () => {
  it('parses a valid YYYY-MM-DD value', () => {
    expect(formatDateValue(parseDateValue('2026-08-14')!)).toBe('2026-08-14');
  });

  it('rejects invalid formats', () => {
    expect(parseDateValue('2026-8-14')).toBeNull();
    expect(parseDateValue('14/08/2026')).toBeNull();
    expect(parseDateValue('2026-02-30')).toBeNull();
    expect(parseDateValue('')).toBeNull();
    expect(parseDateValue(undefined)).toBeNull();
  });
});

describe('resolveDashboardPeriod', () => {
  it('defaults to today when no date is supplied', () => {
    const period = resolveDashboardPeriod(undefined, NOW);
    expect(period.isToday).toBe(true);
    expect(period.dateValue).toBe('2026-08-14');
    expect(period.triggerLabel).toBe('Today');
    expect(period.asOfLabel).toContain('Aug');
    expect(period.asOfLabel).toContain('2026');
  });

  it('resolves a past date and bounds rewards to that day', () => {
    const period = resolveDashboardPeriod('2026-08-05', NOW);
    expect(period.isToday).toBe(false);
    expect(period.isCurrentMonth).toBe(true);
    expect(period.dateValue).toBe('2026-08-05');
    expect(period.triggerLabel).toContain('Aug');
    expect(period.referenceDate.getHours()).toBe(0);
  });

  it('clamps future dates to today', () => {
    const period = resolveDashboardPeriod('2026-09-20', NOW);
    expect(period.isToday).toBe(true);
    expect(period.dateValue).toBe('2026-08-14');
  });
});

describe('shiftDashboardPeriodDays', () => {
  it('steps forward and backward by whole days', () => {
    expect(shiftDashboardPeriodDays('2026-08-13', 1, NOW)).toBe('2026-08-14');
    expect(shiftDashboardPeriodDays('2026-08-14', -1, NOW)).toBe('2026-08-13');
  });

  it('never advances past today', () => {
    expect(shiftDashboardPeriodDays('2026-08-14', 5, NOW)).toBe('2026-08-14');
  });
});

describe('shiftDashboardPeriodMonths', () => {
  it('steps between months preserving the day of month', () => {
    expect(shiftDashboardPeriodMonths('2026-08-05', -1, NOW)).toBe('2026-07-05');
    expect(shiftDashboardPeriodMonths('2026-06-20', 1, NOW)).toBe('2026-07-20');
    expect(shiftDashboardPeriodMonths('2026-08-05', 1, NOW)).toBe('2026-08-14');
  });

  it('clamps the day when the target month is shorter', () => {
    expect(shiftDashboardPeriodMonths('2026-05-31', -1, NOW)).toBe('2026-04-30');
  });
});
