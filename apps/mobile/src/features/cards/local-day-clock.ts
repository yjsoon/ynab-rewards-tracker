export function millisecondsUntilNextLocalMidnight(now = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

export function millisecondsUntilNextDashboardUpdate(
  now = new Date(),
  cacheFreshnessDeadline?: number,
): number {
  const midnightDelay = millisecondsUntilNextLocalMidnight(now);
  if (
    cacheFreshnessDeadline === undefined
    || !Number.isFinite(cacheFreshnessDeadline)
    || cacheFreshnessDeadline <= now.getTime()
  ) {
    return midnightDelay;
  }

  return Math.min(midnightDelay, cacheFreshnessDeadline - now.getTime());
}

/**
 * Notify once per local calendar-day rollover without polling. Recomputing the
 * delay after every tick keeps the schedule correct across DST transitions.
 */
export function startDashboardClock(
  onUpdate: (timestamp: number) => void,
  cacheFreshnessDeadline?: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const scheduleNext = () => {
    timer = setTimeout(() => {
      if (stopped) {
        return;
      }
      onUpdate(Date.now());
      scheduleNext();
    }, millisecondsUntilNextDashboardUpdate(new Date(), cacheFreshnessDeadline));
  };

  scheduleNext();
  return () => {
    stopped = true;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };
}
