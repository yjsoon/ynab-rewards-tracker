export function millisecondsUntilNextLocalMidnight(now = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

/**
 * Notify once per local calendar-day rollover without polling. Recomputing the
 * delay after every tick keeps the schedule correct across DST transitions.
 */
export function startLocalMidnightTicker(
  onMidnight: (timestamp: number) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const scheduleNext = () => {
    timer = setTimeout(() => {
      if (stopped) {
        return;
      }
      onMidnight(Date.now());
      scheduleNext();
    }, millisecondsUntilNextLocalMidnight());
  };

  scheduleNext();
  return () => {
    stopped = true;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };
}
