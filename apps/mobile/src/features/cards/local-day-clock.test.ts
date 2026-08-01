import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  millisecondsUntilNextDashboardUpdate,
  millisecondsUntilNextLocalMidnight,
  nextActivityClockDeadline,
  nextRelativeAgeUpdateAt,
  startDashboardClock,
} from './local-day-clock';

afterEach(() => {
  vi.useRealTimers();
});

describe('local day clock', () => {
  it('computes the next boundary using the local calendar', () => {
    const now = new Date(2026, 7, 1, 23, 59, 59, 750);

    expect(millisecondsUntilNextLocalMidnight(now)).toBe(250);
  });

  it('ticks at each local midnight and stops cleanly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 23, 59, 59, 900));
    const onMidnight = vi.fn();
    const stop = startDashboardClock(onMidnight);

    vi.advanceTimersByTime(99);
    expect(onMidnight).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onMidnight).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(onMidnight).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(onMidnight).toHaveBeenCalledTimes(2);
  });

  it('wakes at cache expiry before midnight, then resumes midnight scheduling', () => {
    vi.useFakeTimers();
    const now = new Date(2026, 7, 1, 10, 0);
    vi.setSystemTime(now);
    const cacheFreshnessDeadline = now.getTime() + 100;
    const onUpdate = vi.fn();
    const stop = startDashboardClock(onUpdate, cacheFreshnessDeadline);

    expect(millisecondsUntilNextDashboardUpdate(now, cacheFreshnessDeadline)).toBe(100);
    vi.advanceTimersByTime(99);
    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(millisecondsUntilNextLocalMidnight(new Date()));
    expect(onUpdate).toHaveBeenCalledTimes(2);

    stop();
  });

  it('ignores invalid or elapsed freshness deadlines', () => {
    const now = new Date(2026, 7, 1, 10, 0);
    const midnightDelay = millisecondsUntilNextLocalMidnight(now);

    expect(millisecondsUntilNextDashboardUpdate(now, Number.NaN)).toBe(midnightDelay);
    expect(millisecondsUntilNextDashboardUpdate(now, now.getTime())).toBe(midnightDelay);
    expect(millisecondsUntilNextDashboardUpdate(now, now.getTime() - 1)).toBe(midnightDelay);
  });

  it('schedules relative labels by minute, then hour, until their date label takes over', () => {
    const updatedAt = new Date(2026, 7, 1, 10, 0).toISOString();

    expect(nextRelativeAgeUpdateAt(updatedAt, new Date(2026, 7, 1, 10, 0, 30).getTime()))
      .toBe(new Date(2026, 7, 1, 10, 1).getTime());
    expect(nextRelativeAgeUpdateAt(updatedAt, new Date(2026, 7, 1, 12, 20).getTime()))
      .toBe(new Date(2026, 7, 1, 13, 0).getTime());
    expect(nextRelativeAgeUpdateAt(updatedAt, new Date(2026, 7, 2, 10, 0).getTime()))
      .toBeUndefined();
    expect(nextRelativeAgeUpdateAt('not-a-date')).toBeUndefined();
  });

  it('chooses the earliest relative-age or freshness transition', () => {
    const now = new Date(2026, 7, 1, 10, 0, 30).getTime();
    const updatedAt = new Date(2026, 7, 1, 10, 0).toISOString();

    expect(nextActivityClockDeadline(updatedAt, now + 10_000, now)).toBe(now + 10_000);
    expect(nextActivityClockDeadline(updatedAt, now + 90_000, now))
      .toBe(new Date(2026, 7, 1, 10, 1).getTime());
    expect(nextActivityClockDeadline(undefined, now - 1, now)).toBeUndefined();
  });
});
