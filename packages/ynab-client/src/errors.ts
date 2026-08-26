/**
 * YNAB API error types and helpers
 */

export type YnabApiErrorCode =
  | 'invalid_token'
  | 'rate_limited'
  | 'network_error'
  | 'timeout'
  | 'unknown_error';

/**
 * Standardised error class for YNAB API errors.
 * Use `isYnabApiError()` to check if an unknown error is a YnabApiError.
 */
export class YnabApiError extends Error {
  readonly code: YnabApiErrorCode;
  readonly status?: number;

  constructor(code: YnabApiErrorCode, message?: string, status?: number) {
    super(message ?? getDefaultMessage(code));
    this.name = 'YnabApiError';
    this.code = code;
    this.status = status;
    
    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, YnabApiError);
    }
  }
}

/**
 * Factory function to create a YnabApiError.
 */
export function createYnabError(
  code: YnabApiErrorCode,
  status?: number,
  message?: string,
): YnabApiError {
  return new YnabApiError(code, message, status);
}

/**
 * Type guard to check if an error is a YnabApiError.
 */
export function isYnabApiError(error: unknown): error is YnabApiError {
  return error instanceof YnabApiError;
}

export function readYnabErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) {
      return fallback;
    }
    try {
      return readYnabErrorMessage(JSON.parse(trimmed) as unknown, trimmed);
    } catch {
      return trimmed;
    }
  }

  if (!isErrorRecord(body)) {
    return fallback;
  }

  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }

  const nested = body.error;
  if (typeof nested === 'string' && nested.trim()) {
    return nested;
  }

  if (isErrorRecord(nested) && typeof nested.detail === 'string' && nested.detail.trim()) {
    return nested.detail;
  }

  return fallback;
}

function isErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Classify an HTTP status code into a YnabApiErrorCode.
 */
export function classifyHttpStatus(status: number): YnabApiErrorCode {
  if (status === 401 || status === 403) {
    return 'invalid_token';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return 'unknown_error';
}

function getDefaultMessage(code: YnabApiErrorCode): string {
  switch (code) {
    case 'invalid_token':
      return 'Invalid or expired YNAB access token';
    case 'rate_limited':
      return 'YNAB API rate limit exceeded';
    case 'network_error':
      return 'Network error connecting to YNAB API';
    case 'timeout':
      return 'Request to YNAB API timed out';
    case 'unknown_error':
      return 'Unknown error from YNAB API';
  }
}
