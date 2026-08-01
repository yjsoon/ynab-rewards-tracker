export const STORAGE_KEY = 'ynab-rewards-tracker';
export const STORAGE_VERSION_KEY = 'ynab-rewards-tracker:data-version';
export const STORAGE_VERSION = '2025-09-22-reset';

/** A missing or different reset marker means persisted state is incompatible. */
export function shouldResetStorage(storedVersion: string | null | undefined): boolean {
  return storedVersion !== STORAGE_VERSION;
}
