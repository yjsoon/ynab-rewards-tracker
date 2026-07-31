import { describe, expect, it } from 'vitest';

import { LatestKeyedTaskQueue } from './latest-keyed-task-queue';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('LatestKeyedTaskQueue', () => {
  it('runs a changed key after the active task settles', async () => {
    const queue = new LatestKeyedTaskQueue<string>();
    const first = deferred();
    const second = deferred();
    const calls: string[] = [];

    const firstRun = queue.run('selection-a', async () => {
      calls.push('selection-a');
      await first.promise;
    });
    const secondRun = queue.run('selection-b', async () => {
      calls.push('selection-b');
      await second.promise;
    });

    await Promise.resolve();
    expect(calls).toEqual(['selection-a']);
    first.resolve();
    await firstRun;
    await Promise.resolve();
    expect(calls).toEqual(['selection-a', 'selection-b']);
    second.resolve();
    await secondRun;
  });

  it('coalesces multiple selection changes to the latest queued task', async () => {
    const queue = new LatestKeyedTaskQueue<string>();
    const first = deferred();
    const calls: string[] = [];

    const firstRun = queue.run('selection-a', async () => {
      calls.push('selection-a');
      await first.promise;
    });
    const superseded = queue.run('selection-b', async () => {
      calls.push('selection-b');
    });
    const latest = queue.run('selection-c', async () => {
      calls.push('selection-c');
    });

    first.resolve();
    await Promise.all([firstRun, superseded, latest]);
    expect(calls).toEqual(['selection-a', 'selection-c']);
  });

  it('drops a stale queued key when the desired key returns to the active task', async () => {
    const queue = new LatestKeyedTaskQueue<string>();
    const first = deferred();
    const calls: string[] = [];

    const firstRun = queue.run('selection-a', async () => {
      calls.push('selection-a');
      await first.promise;
    });
    const stale = queue.run('selection-b', async () => {
      calls.push('selection-b');
    });
    const current = queue.run('selection-a', async () => {
      calls.push('duplicate-selection-a');
    });

    first.resolve();
    await Promise.all([firstRun, stale, current]);
    expect(calls).toEqual(['selection-a']);
  });

  it('continues with queued work when the active task fails', async () => {
    const queue = new LatestKeyedTaskQueue<string>();
    const first = deferred();
    const calls: string[] = [];

    const firstRun = queue.run('selection-a', async () => {
      calls.push('selection-a');
      await first.promise;
    });
    const secondRun = queue.run('selection-b', async () => {
      calls.push('selection-b');
    });

    first.reject(new Error('stale fetch failed'));
    await expect(firstRun).rejects.toThrow('stale fetch failed');
    await secondRun;
    expect(calls).toEqual(['selection-a', 'selection-b']);
  });
});
