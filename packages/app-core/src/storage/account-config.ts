import { YNAB_FLAG_COLORS, UNFLAGGED_FLAG } from '../ynab/constants';
import type { CreditCard } from './types';

export type AccountRewardsConfig = Omit<CreditCard, 'id' | 'ynabAccountId' | 'featured'>;

type ObjectValue = Record<string, unknown>;
type Reader = (value: unknown) => unknown;
const flags = [...YNAB_FLAG_COLORS.map(({ value }) => value), UNFLAGGED_FLAG.value];

function invalid(): never {
  throw new Error('Invalid rewards configuration. Check the card fields and nested references.');
}
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as ObjectValue;
}
const string: Reader = (value) => typeof value === 'string' ? value : invalid();
const nonempty: Reader = (value) => typeof value === 'string' && value.trim() ? value.trim() : invalid();
const boolean: Reader = (value) => typeof value === 'boolean' ? value : invalid();
const finite: Reader = (value) => typeof value === 'number' && Number.isFinite(value) ? value : invalid();
const number: Reader = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : invalid();
const nullable = (read: Reader): Reader => (value) => value === null ? null : read(value);
const optionalObject = (read: Reader): Reader => (value) => value === null ? undefined : read(value);
const oneOf = (values: readonly unknown[]): Reader => (value) => values.includes(value) ? value : invalid();
const integer = (min: number, max: number): Reader => (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : invalid();
const date: Reader = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid();
  return value;
};

// Each object is rebuilt from an allowlist; unknown keys never reach storage or export.
function fields(value: unknown, required: Record<string, Reader>, optional: Record<string, Reader> = {}): ObjectValue {
  const input = object(value);
  const output: ObjectValue = {};
  for (const [key, read] of Object.entries(required)) output[key] = read(input[key]);
  for (const [key, read] of Object.entries(optional)) {
    if (input[key] !== undefined) output[key] = read(input[key]);
  }
  return output;
}
const array = (read: Reader): Reader => (value) => Array.isArray(value) ? value.map(read) : invalid();
const amounts = { earningRate: nullable(number), earningBlockSize: nullable(number), minimumSpend: nullable(number), maximumSpend: nullable(number) };

function readCard(value: unknown): AccountRewardsConfig {
  const result = fields(value, { name: nonempty, issuer: string, type: oneOf(['cashback', 'miles']) }, {
    ...amounts,
    billingCycle: optionalObject((input) => fields(input, { type: oneOf(['calendar', 'billing']) }, { dayOfMonth: integer(1, 31) })),
    rewardPeriod: optionalObject((input) => fields(input, { monthCount: integer(2, 24), anchorDate: date, monthlyMinimumSpend: number })),
    promotionalPeriod: optionalObject((input) => {
      const period = fields(input, { endDate: date }, { startDate: nullable(date), description: string });
      if (typeof period.startDate === 'string' && period.startDate > (period.endDate as string)) invalid();
      return period;
    }),
    subcategoriesEnabled: boolean,
    subcategories: optionalObject(array((input) => fields(input, {
      id: nonempty, name: nonempty, flagColor: oneOf(flags), rewardValue: number,
      priority: finite, active: (value) => value === undefined ? true : boolean(value), createdAt: nonempty, updatedAt: nonempty,
    }, {
      milesBlockSize: nullable(number), minimumSpend: nullable(number), maximumSpend: nullable(number), excludeFromRewards: boolean,
    }))),
    spendingTiers: optionalObject(array((input) => fields(input, { id: nonempty, spendThreshold: number }, {
      earningRate: nullable(number), maximumSpend: nullable(number),
      subcategories: optionalObject(array((override) => fields(override, { subcategoryId: nonempty, rewardValue: number }, { maximumSpend: nullable(number) }))),
    }))),
    flagNames: (input) => {
      const labels = object(input);
      if (Object.keys(labels).some((key) => !flags.includes(key as typeof flags[number]))) invalid();
      return Object.keys(labels).length ? fields(labels, {}, Object.fromEntries(flags.map((flag) => [flag, string]))) : undefined;
    },
  }) as unknown as AccountRewardsConfig;
  const ids = new Set<string>();
  const seenFlags = new Set<string>();
  for (const sub of result.subcategories ?? []) {
    if (ids.has(sub.id) || seenFlags.has(sub.flagColor)) invalid();
    ids.add(sub.id);
    seenFlags.add(sub.flagColor);
  }
  if (result.subcategoriesEnabled && !seenFlags.has(UNFLAGGED_FLAG.value)) {
    throw new Error('This configuration enables categories without an unflagged category. Rewards Tracker requires an explicit unflagged category; add one with a zero rate or excluded from rewards before importing.');
  }
  const tierIds = new Set<string>();
  const thresholds = new Set<number>();
  for (const tier of result.spendingTiers ?? []) {
    if (tierIds.has(tier.id) || thresholds.has(tier.spendThreshold)) invalid();
    tierIds.add(tier.id);
    thresholds.add(tier.spendThreshold);
    const references = new Set<string>();
    for (const sub of tier.subcategories ?? []) {
      if (!ids.has(sub.subcategoryId) || references.has(sub.subcategoryId)) invalid();
      references.add(sub.subcategoryId);
    }
  }
  return result;
}

export function parseAccountConfig(json: string): AccountRewardsConfig {
  const envelope = object(JSON.parse(json));
  if (envelope.format !== 'rewards-account-config' || envelope.version !== 1) {
    throw new Error('Unsupported rewards configuration format or version. Choose a per-account rewards configuration file.');
  }
  return readCard(envelope.card);
}

export function exportAccountConfig(card: unknown): string {
  return JSON.stringify({ format: 'rewards-account-config', version: 1, card: readCard(card) }, null, 2);
}
