import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatLastUpdated } from './format-last-updated';

describe('formatLastUpdated', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no timestamp is stored', () => {
    expect(formatLastUpdated(null)).toBeNull();
  });

  it('returns just now for future timestamps', () => {
    expect(formatLastUpdated('2026-08-22T12:00:30.000Z')).toBe('just now');
  });

  it('returns just now under one minute', () => {
    expect(formatLastUpdated('2026-08-22T11:59:30.000Z')).toBe('just now');
  });

  it('returns 1 min ago', () => {
    expect(formatLastUpdated('2026-08-22T11:59:00.000Z')).toBe('1 min ago');
  });

  it('returns N mins ago', () => {
    expect(formatLastUpdated('2026-08-22T11:55:00.000Z')).toBe('5 mins ago');
  });

  it('returns 1 hour ago', () => {
    expect(formatLastUpdated('2026-08-22T11:00:00.000Z')).toBe('1 hour ago');
  });

  it('returns N hours ago', () => {
    expect(formatLastUpdated('2026-08-22T09:00:00.000Z')).toBe('3 hours ago');
  });

  it('returns a short date after a day', () => {
    expect(formatLastUpdated('2026-08-20T12:00:00.000Z')).toBe('Aug 20');
  });
});
