import { describe, expect, it } from 'vitest';

import { formatMilesValueSample } from './currency-sample';

describe('formatMilesValueSample', () => {
  it('uses the narrow currency symbol for USD in locales that would otherwise show US$', () => {
    expect(formatMilesValueSample('USD', '1', 'en-SG')).toBe('$1,000.00');
  });
});
