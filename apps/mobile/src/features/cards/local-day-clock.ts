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

export function nextRelativeAgeUpdateAt(
  timestamp: string | undefined,
  now = Date.now(),
): number | undefined {
  if (!timestamp) return undefined;
  const updatedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(updatedAt)) return undefined;

  const elapsed = Math.max(0, now - updatedAt);
  if (elapsed < 60 * 60 * 1000) {
    return updatedAt + (Math.floor(elapsed / 60_000) + 1) * 60_000;
  }
  if (elapsed < 24 * 60 * 60 * 1000) {
    return updatedAt + (Math.floor(elapsed / (60 * 60 * 1000)) + 1) * 60 * 60 * 1000;
  }
  return undefined;
}

export function nextActivityClockDeadline(
  timestamp: string | undefined,
  cacheFreshnessDeadline: number | undefined,
  now = Date.now(),
): number | undefined {
  const candidates = [
    cacheFreshnessDeadline,
    nextRelativeAgeUpdateAt(timestamp, now),
  ].filter((deadline): deadline is number => (
    deadline !== undefined && Number.isFinite(deadline) && deadline > now
  ));

  return candidates.length > 0 ? Math.min(...candidates) : undefined;
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
