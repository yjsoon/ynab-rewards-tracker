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

    const result = parseCategoryImportResponse(raw);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.parsed.buckets[0]).toMatchObject({ name: 'Dining', rewardValue: 4, milesBlockSize: 5 });
    expect(result.parsed.cardLimits?.earningRate).toBe(1.4);
    expect(result.parsed.spendingTiers?.[0]?.spendThreshold).toBe(2000);
    expect(result.parsed.notes).toEqual(['Foreign currency is 0.5 mpd']);
  });

  it('returns unparseable when buckets are missing', () => {
    expect(parseCategoryImportResponse('{"notes":[]}')).toEqual({
      kind: 'unparseable',
      message: 'The model did not return usable categories.',
    });
  });

  it('rejects buckets that do not match the model schema', () => {
    expect(parseCategoryImportResponse(
      JSON.stringify({ buckets: [{ name: 'Dining', rewardValue: 4 }] }),
    )).toMatchObject({ kind: 'unparseable' });
  });

  it('keeps an explicit all-null cardLimits object', () => {
    const result = parseCategoryImportResponse(
      JSON.stringify({
        cardLimits: { earningRate: null, earningBlockSize: null, minimumSpend: null, maximumSpend: null },
        buckets: [{
          name: 'Dining',
          rewardValue: 4,
          milesBlockSize: null,
          minimumSpend: null,
          maximumSpend: null,
          excludeFromRewards: false,
          inclusion: null,
        }],
        spendingTiers: null,
        notes: [],
      }),
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.parsed.cardLimits).toEqual({
      earningRate: null,
      earningBlockSize: null,
      minimumSpend: null,
      maximumSpend: null,
    });
  });

  it('rejects numeric strings from the model', () => {
    expect(parseCategoryImportResponse(
      JSON.stringify({
        cardLimits: null,
        buckets: [{
          name: 'Dining',
          rewardValue: '4',
          milesBlockSize: null,
          minimumSpend: null,
          maximumSpend: null,
          excludeFromRewards: false,
          inclusion: null,
        }],
        spendingTiers: null,
        notes: [],
      }),
    )).toMatchObject({ kind: 'unparseable' });
  });
});
