/**
 * Pure helper functions for storage operations.
 * Extracted from web and mobile storage services to eliminate duplication.
 * These functions have no side effects and don't depend on platform-specific APIs.
 */

import type {
  Transaction,
  CachedTransaction,
  DashboardTransactionsCacheEntry,
  StorageData,
} from './types';

/**
 * Validates and sanitizes a transaction for cache storage.
 * Filters out invalid transactions and normalizes optional fields to null.
 *
 * @param txn - Transaction or CachedTransaction to sanitize
 * @returns Sanitized CachedTransaction or null if validation fails
 */
export function sanitizeTransactionForCache(
  txn: Transaction | CachedTransaction
): CachedTransaction | null {
  // Validate required fields
  if (
    typeof txn.id !== 'string' ||
    typeof txn.date !== 'string' ||
    typeof txn.amount !== 'number' ||
    typeof txn.account_id !== 'string'
  ) {
    return null;
  }

  return {
    id: txn.id,
    date: txn.date,
    amount: txn.amount,
    account_id: txn.account_id,
    payee_name: txn.payee_name ?? null,
    category_name: txn.category_name ?? null,
    flag_color: txn.flag_color ?? null,
    flag_name: txn.flag_name ?? null,
    cleared: txn.cleared ?? null,
    approved: txn.approved,
  };
}

/**
 * Generic upsert helper: updates existing item by ID or pushes new item.
 * Mutates the items array in place.
 *
 * @param items - Array of items with id property
 * @param item - Item to upsert
 */
export function upsertById<T extends { id: string }>(
  items: T[],
  item: T
): void {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
}

/**
 * Creates a normalized cache key from budget, date, and tracked accounts.
 * Sorts account IDs to ensure consistent key generation regardless of input order.
 *
 * @param budgetId - YNAB budget ID
 * @param sinceDate - ISO date string for transaction filtering
 * @param trackedAccountIds - Array of account IDs being tracked
 * @returns Normalized cache key string
 */
export function createDashboardCacheKey(
  budgetId: string,
  sinceDate: string,
  trackedAccountIds: string[]
): string {
  const sortedIds = [...trackedAccountIds].sort().join(',');
  return `${budgetId}::${sinceDate}::${sortedIds}`;
}

/**
 * Finds a dashboard cache entry matching the given criteria.
 * Normalizes account IDs for comparison to ensure matches regardless of order.
 *
 * @param entries - Array of cached dashboard transaction entries
 * @param budgetId - Budget ID to match
 * @param sinceDate - Since date to match
 * @param trackedAccountIds - Account IDs to match
 * @returns Matching cache entry or undefined
 */
export function findDashboardCacheEntry(
  entries: DashboardTransactionsCacheEntry[],
  budgetId: string,
  sinceDate: string,
  trackedAccountIds: string[]
): DashboardTransactionsCacheEntry | undefined {
  const normalizedIds = [...trackedAccountIds].sort().join(',');

  return entries.find((entry) => {
    const entryIds = [...entry.trackedAccountIds].sort().join(',');
    return (
      entry.budgetId === budgetId &&
      entry.sinceDate === sinceDate &&
      entryIds === normalizedIds
    );
  });
}

/**
 * Applies card deletion cascade logic to storage data.
 * Removes the card and all associated rules and tag mappings.
 * Mutates storage data in place.
 *
 * @param storage - Storage data object to modify
 * @param cardId - ID of card to delete
 */
export function applyCardDeletion(
  storage: Pick<StorageData, 'cards' | 'rules' | 'tagMappings'>,
  cardId: string
): void {
  storage.cards = storage.cards.filter((card) => card.id !== cardId);
  storage.rules = storage.rules.filter((rule) => rule.cardId !== cardId);
  storage.tagMappings = storage.tagMappings.filter(
    (mapping) => mapping.cardId !== cardId
  );
}

/**
 * Validates and parses a hiddenUntil date string.
 *
 * @param hiddenUntil - ISO date string
 * @returns Parsed Date object
 * @throws Error if date is invalid
 */
export function validateHiddenUntilDate(hiddenUntil: string): Date {
  const expiry = new Date(hiddenUntil);

  if (Number.isNaN(expiry.getTime())) {
    throw new Error('Invalid hiddenUntil date');
  }

  return expiry;
}

/**
 * Normalizes a period string into start and end components.
 * Handles both single-date periods and date ranges.
 *
 * @param period - Period string (e.g., "2024-01" or "2024-01-01 → 2024-01-31")
 * @returns Object with start and end date strings
 */
export function normalizePeriod(period: string): {
  start: string;
  end: string;
} {
  if (!period.includes(' → ')) {
    return { start: period, end: period };
  }

  const [start, end] = period.split(' → ');
  return { start, end };
}

/**
 * Normalizes a number value, returning null for invalid inputs.
 * Only accepts finite numbers - rejects Infinity, NaN, and invalid strings.
 * Useful for form inputs where empty strings should become null.
 *
 * @param value - Number or string to normalize
 * @returns Finite number or null
 */
export function normaliseNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : null;
}
