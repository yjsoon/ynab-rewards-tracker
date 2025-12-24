import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestJson, defaultBackoff } from './request';
import { YnabApiError, isYnabApiError } from './errors';

describe('defaultBackoff', () => {
  it('returns exponential backoff values', () => {
    expect(defaultBackoff(0)).toBe(1000);   // 1s
    expect(defaultBackoff(1)).toBe(2000);   // 2s
    expect(defaultBackoff(2)).toBe(4000);   // 4s
    expect(defaultBackoff(3)).toBe(8000);   // 8s
  });

  it('caps at 30 seconds', () => {
    expect(defaultBackoff(10)).toBe(30000);
    expect(defaultBackoff(100)).toBe(30000);
  });
});

describe('requestJson', () => {
  const mockFetch = vi.fn();
  const defaultOptions = {
    path: '/budgets',
    accessToken: 'test-token',
    fetchImpl: mockFetch,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('returns parsed JSON on success', async () => {
      const mockData = { data: { budgets: [] } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      });

      const result = await requestJson(defaultOptions);
      expect(result).toEqual(mockData);
    });

    it('includes authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await requestJson(defaultOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ynab.com/v1/budgets',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        }),
      );
    });
  });

  describe('error classification', () => {
    it('throws invalid_token for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'invalid_token',
        status: 401,
      });
    });

    it('throws invalid_token for 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'invalid_token',
        status: 403,
      });
    });

    it('throws rate_limited for 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map(),
      });

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'rate_limited',
        status: 429,
      });
    });

    it('throws unknown_error for other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { detail: 'Server error' } }),
      });

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'unknown_error',
        status: 500,
      });
    });

    it('throws network_error for fetch TypeError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'network_error',
      });
    });

    it('throws network_error for React Native network failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'network_error',
      });
    });

    it('throws timeout for timeout errors', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      mockFetch.mockRejectedValueOnce(timeoutError);

      await expect(requestJson(defaultOptions)).rejects.toMatchObject({
        code: 'timeout',
      });
    });
  });

  describe('retry behaviour', () => {
    // Use real timers with minimal delays to avoid fake timer async issues
    beforeEach(() => {
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useFakeTimers();
    });

    it('retries network errors up to maxRetries', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await requestJson({
        ...defaultOptions,
        maxRetries: 2,
        backoffMs: () => 1, // Minimal delay
      });

      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries timeout errors up to maxRetries', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';

      mockFetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await requestJson({
        ...defaultOptions,
        maxRetries: 1,
        backoffMs: () => 1, // Minimal delay
      });

      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries 429 with Retry-After header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '0']]), // Immediate retry
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await requestJson({
        ...defaultOptions,
        maxRetries: 1,
      });

      expect(result).toEqual({ data: 'success' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry auth errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(requestJson({
        ...defaultOptions,
        maxRetries: 3,
      })).rejects.toMatchObject({
        code: 'invalid_token',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws after exhausting retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(requestJson({
        ...defaultOptions,
        maxRetries: 2,
        backoffMs: () => 1, // Minimal delay
      })).rejects.toMatchObject({
        code: 'network_error',
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('timeout handling', () => {
    // Use real timers for timeout test
    beforeEach(() => {
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useFakeTimers();
    });

    it('applies timeout to requests', async () => {
      // Mock a request that hangs until aborted
      mockFetch.mockImplementationOnce((_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (signal) {
            if (signal.aborted) {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
              return;
            }
            signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }
        });
      });

      await expect(requestJson({
        ...defaultOptions,
        timeoutMs: 50, // Short timeout for fast test
      })).rejects.toMatchObject({
        code: 'timeout',
      });
    });
  });
});

describe('YnabApiError', () => {
  it('is properly classified by isYnabApiError', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    try {
      await requestJson({
        path: '/test',
        accessToken: 'token',
        fetchImpl: mockFetch,
      });
    } catch (error) {
      expect(isYnabApiError(error)).toBe(true);
      expect(error).toBeInstanceOf(YnabApiError);
    }
  });
});
