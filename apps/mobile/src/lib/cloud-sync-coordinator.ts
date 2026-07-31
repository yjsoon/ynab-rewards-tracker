export type CloudSyncLease = {
  release: () => void;
};

let active = false;
const waiters: Array<() => void> = [];

/** Serialises complete automatic and manual Cloud Sync operations across the app. */
export async function acquireCloudSyncLease(): Promise<CloudSyncLease> {
  if (active) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  } else {
    active = true;
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) {
        next();
      } else {
        active = false;
      }
    },
  };
}
