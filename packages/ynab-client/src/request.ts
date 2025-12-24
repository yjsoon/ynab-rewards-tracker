/**
 * Core request helper for YNAB API with configurable timeout, retry, and backoff.
 */

import { YnabApiError, createYnabError } from './errors';
import type { YnabApiErrorCode } from './errors';

export const DEFAULT_BASE_URL = 'https://api.ynab.com/v1';

export interface RequestOptions {
  /** API path (e.g., '/budgets' or '/budgets/{id}/accounts') */
  path: string;
  /** YNAB Personal Access Token */
  accessToken: string;
  /** Base URL for API requests (default: https://api.ynab.com/v1) */
  baseUrl?: string;
  /** Custom fetch implementation for testing or platform-specific needs */
  fetchImpl?: typeof fetch;
  /** HTTP method (default: GET) */
  method?: string;
  /** Additional headers */
  headers?: HeadersInit;
  /** Request body */
  body?: BodyInit | null;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Timeout in milliseconds (undefined = no timeout) */
  timeoutMs?: number;
  /** Max retries for rate limiting and network errors (default: 0) */
  maxRetries?: number;
  /** Backoff function returning ms to wait before retry */
  backoffMs?: (attempt: number, meta: { status?: number; code?: YnabApiErrorCode }) => number;
}

/**
 * Default exponential backoff: 1s, 2s, 4s...
 */
export function defaultBackoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Make a JSON request to the YNAB API with error classification.
 */
export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const {
    path,
    accessToken,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = fetch,
    method = 'GET',
    headers = {},
    body,
    signal,
    timeoutMs,
    maxRetries = 0,
    backoffMs = defaultBackoff,
  } = options;

  const url = `${baseUrl}${path}`;
  let lastError: YnabApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await executeRequest({
        url,
        accessToken,
        fetchImpl,
        method,
        headers,
        body,
        signal,
        timeoutMs,
      });

      // Handle rate limiting with retry
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        const waitMs = retryAfter ?? backoffMs(attempt, { status: 429, code: 'rate_limited' });
        await sleep(waitMs);
        continue;
      }

      // Handle auth errors (no retry)
      if (response.status === 401 || response.status === 403) {
        throw createYnabError('invalid_token', response.status);
      }

      // Handle rate limit (final attempt)
      if (response.status === 429) {
        throw createYnabError('rate_limited', 429);
      }

      // Handle other non-OK responses
      if (!response.ok) {
        const errorBody = await safeJsonParse(response);
        const message = errorBody?.error?.detail ?? `HTTP ${response.status}`;
        throw createYnabError('unknown_error', response.status, message);
      }

      // Success - parse JSON
      const json = await response.json();
      return json as T;

    } catch (error) {
      // Already a YnabApiError - check if retryable
      if (error instanceof YnabApiError) {
        lastError = error;
        
        // Only retry network errors
        if (error.code === 'network_error' && attempt < maxRetries) {
          const waitMs = backoffMs(attempt, { code: 'network_error' });
          await sleep(waitMs);
          continue;
        }
        
        throw error;
      }

      // Classify other errors
      const classified = classifyError(error);
      lastError = classified;

      // Retry network errors and timeouts
      if ((classified.code === 'network_error' || classified.code === 'timeout') && attempt < maxRetries) {
        const waitMs = backoffMs(attempt, { code: classified.code });
        await sleep(waitMs);
        continue;
      }

      throw classified;
    }
  }

  // Should not reach here, but satisfy TypeScript
  throw lastError ?? createYnabError('unknown_error');
}

interface ExecuteRequestOptions {
  url: string;
  accessToken: string;
  fetchImpl: typeof fetch;
  method: string;
  headers: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function executeRequest(options: ExecuteRequestOptions): Promise<Response> {
  const { url, accessToken, fetchImpl, method, headers, body, signal, timeoutMs } = options;

  const mergedSignal = timeoutMs ? mergeAbortSignals(signal, timeoutMs) : signal;

  try {
    return await fetchImpl(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
      signal: mergedSignal,
    });
  } catch (error) {
    throw classifyError(error);
  }
}

/**
 * Merge an optional external signal with a timeout signal.
 */
function mergeAbortSignals(externalSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  // Clean up timeout if external signal aborts first
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort(externalSignal.reason);
      }, { once: true });
    }
  }

  // Clean up external listener when controller aborts
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
  }, { once: true });

  return controller.signal;
}

/**
 * Classify an unknown error into a YnabApiError.
 */
function classifyError(error: unknown): YnabApiError {
  if (error instanceof YnabApiError) {
    return error;
  }

  // Check for abort/timeout
  if (error instanceof DOMException) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      // Check if it's specifically a timeout
      if (error.message?.includes('timed out') || error.name === 'TimeoutError') {
        return createYnabError('timeout');
      }
      // Otherwise it's a user cancellation - treat as network error
      return createYnabError('network_error', undefined, 'Request was cancelled');
    }
  }

  // Check for network errors
  if (error instanceof TypeError) {
    // TypeError is thrown for network failures in fetch
    return createYnabError('network_error', undefined, error.message);
  }

  // Check for "Network request failed" (React Native)
  if (error instanceof Error && error.message?.includes('Network request failed')) {
    return createYnabError('network_error', undefined, error.message);
  }

  // Unknown error
  const message = error instanceof Error ? error.message : String(error);
  return createYnabError('unknown_error', undefined, message);
}

/**
 * Parse Retry-After header (seconds or HTTP date).
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  // Try parsing as seconds
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(header);
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

/**
 * Safely parse JSON from a response, returning null on failure.
 */
async function safeJsonParse(response: Response): Promise<{ error?: { detail?: string } } | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
