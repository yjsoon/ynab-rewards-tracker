const EXPECTED_STORAGE_CANCELLATION_MESSAGES = new Set([
  'Credential read was cancelled.',
  'Storage operation was cancelled.',
]);
const MAX_EXPECTED_CANCELLATION_ATTEMPTS = 3;

export function isExpectedStorageCancellation(error: unknown): boolean {
  return error instanceof Error
    && EXPECTED_STORAGE_CANCELLATION_MESSAGES.has(error.message);
}

export async function retryExpectedStorageCancellation<T>(
  operation: () => Promise<T>,
  isCurrent: () => boolean,
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= MAX_EXPECTED_CANCELLATION_ATTEMPTS; attempt += 1) {
    if (!isCurrent()) return undefined;
    try {
      return await operation();
    } catch (error) {
      if (!isCurrent()) return undefined;
      if (!isExpectedStorageCancellation(error)) throw error;
      if (attempt === MAX_EXPECTED_CANCELLATION_ATTEMPTS) throw error;
    }
  }

  return undefined;
}
