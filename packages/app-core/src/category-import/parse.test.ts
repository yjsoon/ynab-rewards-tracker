import { describe, expect, it } from 'vitest';

import { parseCategoryImportResponse } from './parse';

describe('parseCategoryImportResponse', () => {
  it('reads a fenced JSON object', () => {
    const raw = [
      'Here you go',
      '```json',
      JSON.stringify({
        cardLimits: { earningRate: 1.4, earningBlockSize: 5, minimumSpend: null, maximumSpend: 20000 },
        buckets: [
          { name: 'Dining', rewardValue: 4, milesBlockSize: 5, minimumSpend: null, maximumSpend: 2000, excludeFromRewards: false, inclusion: 'restaurants' },
        ],
        spendingTiers: [{ spendThreshold: 2000, earningRate: 4, maximumSpend: null }],
        notes: ['Foreign currency is 0.5 mpd'],
      }),
      '```',
    ].join('\n');

    const result = parseCategoryImportResponse(raw, 'miles');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.parsed.buckets[0]).toMatchObject({ name: 'Dining', rewardValue: 4, milesBlockSize: 5 });
    expect(result.parsed.cardLimits?.earningRate).toBe(1.4);
    expect(result.parsed.spendingTiers?.[0]?.spendThreshold).toBe(2000);
    expect(result.parsed.notes).toEqual(['Foreign currency is 0.5 mpd']);
  });

  it('returns unparseable when buckets are missing', () => {
    expect(parseCategoryImportResponse('{"notes":[]}', 'cashback')).toEqual({
      kind: 'unparseable',
      message: 'The model did not return usable categories.',
    });
  });
});
