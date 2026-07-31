import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  millisecondsUntilNextLocalMidnight,
  startLocalMidnightTicker,
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
    const stop = startLocalMidnightTicker(onMidnight);

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
});
