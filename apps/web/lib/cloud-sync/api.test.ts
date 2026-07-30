import { describe, expect, it } from 'vitest';

import { parseCloudSyncErrorMessage } from './api';

describe('cloud sync API client errors', () => {
  it('maps plain-text unconfigured responses to a friendly message', () => {
    expect(parseCloudSyncErrorMessage(501, 'Cloud sync not configured')).toBe(
      'Cloud Sync is not configured for this environment. You can keep using this browser locally, or configure Cloudflare KV to enable backup and multi-device sync.'
    );
  });

  it.each([
    JSON.stringify({ error: 'Cloud sync not configured' }),
    JSON.stringify({ error: 'Cloudflare (501): Cloud sync not configured' }),
  ])('maps JSON unconfigured responses to a friendly message', (body) => {
    expect(
      parseCloudSyncErrorMessage(501, body)
    ).toBe(
      'Cloud Sync is not configured for this environment. You can keep using this browser locally, or configure Cloudflare KV to enable backup and multi-device sync.'
    );
  });

  it('extracts other JSON error bodies without rewriting them', () => {
    expect(parseCloudSyncErrorMessage(500, JSON.stringify({ error: 'KV temporarily unavailable' }))).toBe(
      'KV temporarily unavailable'
    );
  });

  it.each([
    '<!DOCTYPE html><html><body>error code: 1101</body></html>',
    'error code: 1101',
    'not JSON',
    '',
  ])('replaces unsafe server error bodies with a temporary-unavailable message', (body) => {
    expect(parseCloudSyncErrorMessage(500, body)).toBe(
      'Cloud sync is temporarily unavailable. Please try again later.'
    );
  });

  it('uses the request-failed fallback for unsafe non-server responses', () => {
    expect(parseCloudSyncErrorMessage(400, 'Bad request')).toBe(
      'Cloud sync request failed. Please try again.'
    );
  });

  it.each([
    JSON.stringify({ error: '<html><body>upstream failure</body></html>' }),
    JSON.stringify({ error: '<!DOCTYPE html>' }),
    JSON.stringify({ error: '&lt;html&gt;upstream failure&lt;/html&gt;' }),
    JSON.stringify({ error: '%3Chtml%3Eupstream failure%3C/html%3E' }),
  ])('rejects HTML and encoded HTML in JSON errors', (body) => {
    expect(parseCloudSyncErrorMessage(502, body)).toBe(
      'Cloud sync is temporarily unavailable. Please try again later.'
    );
  });

  it('rejects overly long JSON errors', () => {
    expect(parseCloudSyncErrorMessage(500, JSON.stringify({ error: 'x'.repeat(501) }))).toBe(
      'Cloud sync is temporarily unavailable. Please try again later.'
    );
  });
});
