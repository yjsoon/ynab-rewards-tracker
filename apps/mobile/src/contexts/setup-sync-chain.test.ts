import { describe, expect, it, vi } from 'vitest';

import { runSetupSyncChain } from './setup-sync-chain';

describe('runSetupSyncChain', () => {
  it('does not start the full setup sync after erase invalidates the original generation', async () => {
    let currentGeneration = 4;
    const loadCards = vi.fn(async () => ['restored-card']);
    const runFullSync = vi.fn(async () => {});

    const completed = await runSetupSyncChain({
      expectedGeneration: 4,
      isCurrent: (generation) => generation === currentGeneration,
      runInitialSync: async () => {
        currentGeneration = 5;
      },
      shouldRunFullSync: true,
      loadCards,
      runFullSync,
    });

    expect(loadCards).not.toHaveBeenCalled();
    expect(runFullSync).not.toHaveBeenCalled();
    expect(completed).toBe(false);
  });

  it('retains the original generation through the chained full sync', async () => {
    const runFullSync = vi.fn(async () => {});

    const completed = await runSetupSyncChain({
      expectedGeneration: 9,
      isCurrent: (generation) => generation === 9,
      runInitialSync: async () => {},
      shouldRunFullSync: true,
      loadCards: async () => ['new-card'],
      runFullSync,
    });

    expect(runFullSync).toHaveBeenCalledWith(['new-card'], 9);
    expect(completed).toBe(true);
  });

  it('does not let an older overlapping chain resume after a newer owner starts', async () => {
    let currentGeneration = 1;
    let releaseFirstSync: (() => void) | undefined;
    const firstSyncStarted = new Promise<void>((resolve) => {
      releaseFirstSync = resolve;
    });
    let resumeFirstSync: (() => void) | undefined;
    const firstSyncPaused = new Promise<void>((resolve) => {
      resumeFirstSync = resolve;
    });
    const firstLoadCards = vi.fn(async () => ['old-card']);
    const firstFullSync = vi.fn(async () => {});

    const first = runSetupSyncChain({
      expectedGeneration: 1,
      isCurrent: (generation) => generation === currentGeneration,
      runInitialSync: async () => {
        releaseFirstSync?.();
        await firstSyncPaused;
      },
      shouldRunFullSync: true,
      loadCards: firstLoadCards,
      runFullSync: firstFullSync,
    });
    await firstSyncStarted;

    currentGeneration = 2;
    const second = runSetupSyncChain({
      expectedGeneration: 2,
      isCurrent: (generation) => generation === currentGeneration,
      runInitialSync: async () => {},
      shouldRunFullSync: false,
      loadCards: async () => [],
      runFullSync: async () => {},
    });
    resumeFirstSync?.();

    await expect(second).resolves.toBe(true);
    await expect(first).resolves.toBe(false);
    expect(firstLoadCards).not.toHaveBeenCalled();
    expect(firstFullSync).not.toHaveBeenCalled();
  });

  it('lets callers suppress success UI for a superseded chain', async () => {
    const notifySuccess = vi.fn();
    const completed = await runSetupSyncChain({
      expectedGeneration: 3,
      isCurrent: () => false,
      runInitialSync: async () => {},
      shouldRunFullSync: true,
      loadCards: async () => [],
      runFullSync: async () => {},
    });

    if (completed) notifySuccess();

    expect(completed).toBe(false);
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
