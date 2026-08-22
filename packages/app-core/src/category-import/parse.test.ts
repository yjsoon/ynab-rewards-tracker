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

  it('fills omitted optional bucket fields', () => {
    const result = parseCategoryImportResponse(
      JSON.stringify({ buckets: [{ name: 'Dining', rewardValue: 4 }] }),
      'cashback',
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.parsed.buckets[0]).toEqual({
      name: 'Dining',
      rewardValue: 4,
      milesBlockSize: null,
      minimumSpend: null,
      maximumSpend: null,
      excludeFromRewards: false,
      inclusion: null,
    });
    expect(result.parsed.notes).toEqual([]);
    expect(result.parsed.cardLimits).toBeNull();
    expect(result.parsed.spendingTiers).toBeNull();
  });

  it('treats an empty cardLimits object as omitted', () => {
    const result = parseCategoryImportResponse(
      JSON.stringify({
        cardLimits: { earningRate: null, earningBlockSize: null, minimumSpend: null, maximumSpend: null },
        buckets: [{ name: 'Dining', rewardValue: 4 }],
      }),
      'cashback',
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.parsed.cardLimits).toBeNull();
  });

  it('reads numeric strings from the model', () => {
    const result = parseCategoryImportResponse(
      JSON.stringify({
        buckets: [{ name: 'Dining', rewardValue: '4', maximumSpend: '2000' }],
      }),
      'cashback',
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.parsed.buckets[0]).toMatchObject({
      name: 'Dining',
      rewardValue: 4,
      maximumSpend: 2000,
    });
  });
});
