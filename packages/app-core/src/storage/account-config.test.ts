import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAccountConfig, exportAccountConfig } from './account-config';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/rewards-account-config.json', import.meta.url), 'utf8'));

describe('account rewards config exchange', () => {
  it('roundtrips portable fields and strips unknown fields at every level', () => {
    const dirty = structuredClone(fixture);
    Object.assign(dirty.card, { id: 'private', ynabAccountId: 'private', featured: false, token: 'secret', transactions: [1] });
    Object.assign(dirty.card.billingCycle, { token: 'secret' });
    Object.assign(dirty.card.subcategories[0], { token: 'secret' });
    Object.assign(dirty.card.spendingTiers[0].subcategories[0], { token: 'secret' });
    expect(parseAccountConfig(JSON.stringify(dirty))).toEqual(fixture.card);
    expect(JSON.parse(exportAccountConfig(dirty.card))).toEqual(fixture);
  });

  it.each([
    { ...fixture, format: 'settings' }, { ...fixture, version: 2 },
    { ...fixture, card: [] }, { ...fixture, card: { ...fixture.card, earningRate: -1 } },
    { ...fixture, card: { ...fixture.card, minimumSpend: '100' } },
    { ...fixture, card: { ...fixture.card, billingCycle: { type: 'billing', dayOfMonth: 32 } } },
    { ...fixture, card: { ...fixture.card, rewardPeriod: { monthCount: 3, anchorDate: '2026-02-30', monthlyMinimumSpend: 0 } } },
    { ...fixture, card: { ...fixture.card, subcategories: [fixture.card.subcategories[0], fixture.card.subcategories[0]] } },
    { ...fixture, card: { ...fixture.card, subcategories: [] } },
  ])('rejects invalid envelopes/config without silently repairing them', (input) => {
    expect(() => parseAccountConfig(JSON.stringify(input))).toThrow();
  });

  it('accepts HowMuch defaults and signed ordering priorities', () => {
    const input = structuredClone(fixture);
    input.card.billingCycle = { type: 'billing' };
    input.card.subcategories[0].priority = -3;
    delete input.card.subcategories[0].active;
    expect(parseAccountConfig(JSON.stringify(input))).toMatchObject({
      billingCycle: { type: 'billing' }, subcategories: [{ priority: -3, active: true }, { active: true }],
    });
  });

  it('rejects enabled categories without unflagged rather than introducing base-rate earnings', () => {
    const input = structuredClone(fixture);
    input.card.subcategories = [input.card.subcategories[0]];
    expect(() => parseAccountConfig(JSON.stringify(input))).toThrow('explicit unflagged category');
    input.card.subcategoriesEnabled = false;
    expect(parseAccountConfig(JSON.stringify(input)).subcategories).toHaveLength(1);
  });

  it.each(['flags', 'thresholds', 'references', 'boolean', 'timestamp'])('rejects conflicting or malformed %s', (kind) => {
    const input = structuredClone(fixture);
    if (kind === 'flags') input.card.subcategories[1].flagColor = 'orange';
    if (kind === 'thresholds') input.card.spendingTiers.push({ ...input.card.spendingTiers[0], id: 'different' });
    if (kind === 'references') input.card.spendingTiers[0].subcategories.push(input.card.spendingTiers[0].subcategories[0]);
    if (kind === 'boolean') input.card.subcategories[0].active = 'false';
    if (kind === 'timestamp') input.card.subcategories[0].createdAt = '';
    expect(() => parseAccountConfig(JSON.stringify(input))).toThrow();
  });
});
