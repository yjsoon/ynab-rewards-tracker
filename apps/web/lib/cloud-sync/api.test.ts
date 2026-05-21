import { describe, expect, it } from 'vitest';

import { parseCloudSyncErrorMessage } from './api';

describe('cloud sync API client errors', () => {
  it('maps plain-text unconfigured responses to a friendly message', () => {
    expect(parseCloudSyncErrorMessage(501, 'Cloud sync not configured')).toBe(
      'Cloud Sync is not configured for this environment. You can keep using this browser locally, or configure Cloudflare KV to enable backup and multi-device sync.'
    );
  });

  it('extracts JSON error bodies before mapping unconfigured responses', () => {
    expect(
      parseCloudSyncErrorMessage(501, JSON.stringify({ error: 'Cloudflare (501): Cloud sync not configured' }))
    ).toBe(
      'Cloud Sync is not configured for this environment. You can keep using this browser locally, or configure Cloudflare KV to enable backup and multi-device sync.'
    );
  });

  it('extracts other JSON error bodies without rewriting them', () => {
    expect(parseCloudSyncErrorMessage(500, JSON.stringify({ error: 'KV temporarily unavailable' }))).toBe(
      'KV temporarily unavailable'
    );
  });
});
