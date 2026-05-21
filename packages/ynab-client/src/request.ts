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
    if (signal?.aborted) {
      throw createYnabError('network_error', undefined, 'Request was cancelled');
    }

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
        await sleep(waitMs, signal);
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
      // Classify the error if not already a YnabApiError
      const classified = error instanceof YnabApiError ? error : classifyError(error);
      lastError = classified;

      // Retry transient errors (network errors and timeouts)
      const isRetryable = classified.code === 'network_error' || classified.code === 'timeout';
      if (signal?.aborted) {
        throw classified;
      }

      if (isRetryable && attempt < maxRetries) {
        const waitMs = backoffMs(attempt, { code: classified.code });
        await sleep(waitMs, signal);
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

  const mergedAbort = timeoutMs ? mergeAbortSignals(signal, timeoutMs) : null;
  const requestSignal = mergedAbort?.signal ?? signal;

  try {
    return await fetchImpl(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
      signal: requestSignal,
    });
  } catch (error) {
    // Check if abort was due to our timeout (signal.reason will be our TimeoutError)
    if (requestSignal?.aborted && (requestSignal.reason as Error)?.name === 'TimeoutError') {
      throw createYnabError('timeout');
    }
    throw classifyError(error);
  } finally {
    mergedAbort?.cleanup();
  }
}

/**
 * Merge an optional external signal with a timeout signal.
 */
function mergeAbortSignals(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    // Use a plain Error with a marker for React Native compatibility
    // (DOMException is not available in Hermes)
    const timeoutError = new Error('Request timed out');
    timeoutError.name = 'TimeoutError';
    controller.abort(timeoutError);
  }, timeoutMs);

  let removeExternalAbortListener = () => {};

  // Clean up timeout if external signal aborts first
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(externalSignal.reason);
    } else {
      const onExternalAbort = () => {
        clearTimeout(timeoutId);
        controller.abort(externalSignal.reason);
      };
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      removeExternalAbortListener = () => {
        externalSignal.removeEventListener('abort', onExternalAbort);
      };
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      removeExternalAbortListener();
    },
  };
}

/**
 * Classify an unknown error into a YnabApiError.
 */
function classifyError(error: unknown): YnabApiError {
  if (error instanceof YnabApiError) {
    return error;
  }

  // Check for abort/timeout errors (works in both browser and React Native)
  // DOMException may not exist in React Native/Hermes, so check by name
  if (error instanceof Error) {
    const errorName = error.name;
    
    // Timeout errors (our custom TimeoutError or browser's)
    if (errorName === 'TimeoutError' || error.message?.includes('timed out')) {
      return createYnabError('timeout');
    }
    
    // Abort errors (user cancellation)
    if (errorName === 'AbortError') {
      return createYnabError('network_error', undefined, 'Request was cancelled');
    }
    
    // Network errors in React Native
    if (error.message?.includes('Network request failed')) {
      return createYnabError('network_error', undefined, error.message);
    }
  }

  // TypeError is thrown for network failures in fetch (browser)
  if (error instanceof TypeError) {
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createYnabError('network_error', undefined, 'Request was cancelled'));
  }

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(createYnabError('network_error', undefined, 'Request was cancelled'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}
