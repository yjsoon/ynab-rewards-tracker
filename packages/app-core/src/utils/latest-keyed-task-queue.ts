type Task = () => Promise<void>;

type ActiveTask<Key> = {
  key: Key;
  promise: Promise<void>;
};

type QueuedTask<Key> = {
  key: Key;
  task: Task;
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

/**
 * Runs one task at a time while retaining only the latest distinct queued key.
 * Re-requesting the active key cancels a stale queued key because the desired
 * state has returned to the work already in flight.
 */
export class LatestKeyedTaskQueue<Key> {
  private active?: ActiveTask<Key>;
  private queued?: QueuedTask<Key>;

  run(key: Key, task: Task): Promise<void> {
    if (!this.active) {
      return this.start(key, task);
    }

    if (Object.is(this.active.key, key)) {
      if (this.queued) {
        const stale = this.queued;
        this.queued = undefined;
        void this.active.promise.then(stale.resolve, stale.reject);
      }
      return this.active.promise;
    }

    if (this.queued) {
      this.queued.key = key;
      this.queued.task = task;
      return this.queued.promise;
    }

    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    this.queued = { key, task, promise, resolve, reject };
    return promise;
  }

  private start(key: Key, task: Task): Promise<void> {
    const promise = Promise.resolve().then(task);
    this.active = { key, promise };
    void promise.then(
      () => this.advance(promise),
      () => this.advance(promise),
    );
    return promise;
  }

  private advance(completed: Promise<void>): void {
    if (this.active?.promise !== completed) return;
    this.active = undefined;

    const next = this.queued;
    this.queued = undefined;
    if (!next) return;

    const promise = this.start(next.key, next.task);
    void promise.then(next.resolve, next.reject);
  }
}
