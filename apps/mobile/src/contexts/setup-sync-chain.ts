export async function runSetupSyncChain<T>({
  expectedGeneration,
  isCurrent,
  runInitialSync,
  shouldRunFullSync,
  loadCards,
  runFullSync,
}: {
  expectedGeneration: number;
  isCurrent: (generation: number) => boolean;
  runInitialSync: (generation: number) => Promise<void>;
  shouldRunFullSync: boolean;
  loadCards: () => Promise<T[]>;
  runFullSync: (cards: T[], generation: number) => Promise<void>;
}): Promise<boolean> {
  await runInitialSync(expectedGeneration);
  if (!isCurrent(expectedGeneration)) return false;
  if (!shouldRunFullSync) return true;

  const cards = await loadCards();
  if (!isCurrent(expectedGeneration)) return false;
  await runFullSync(cards, expectedGeneration);
  return isCurrent(expectedGeneration);
}
