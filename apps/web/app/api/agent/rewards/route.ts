import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import { computeKeyId, decryptJson } from '@/lib/cloud-sync/encryption';
import type {
  StorageData,
  RewardCalculation,
  CreditCard,
  MonthlyQualificationBreakdown,
  RewardQualificationStatus,
  ThemeGroup,
} from '@ynab-counter/app-core/storage/types';
import type { TransactionWithRewards } from '@ynab-counter/app-core/storage/types';
import {
  computeCurrentPeriod,
  RecommendationEngine,
  resolveCardSpendingTier,
  SimpleRewardsCalculator,
} from '@ynab-counter/app-core/rewards-engine';
import { getAlertRecommendations, getCardRecommendations } from '@ynab-counter/app-core/rewards-engine/utils/card-recommendations';
import { buildCardEntries } from '@ynab-counter/app-core/rewards-engine/utils/category-insights';
import { resolveLatestPeriod } from '@ynab-counter/app-core/rewards-engine/utils/recommendation-helpers';
import {
  getRewardPeriodMinimumScope,
  isWholePeriodMinimum,
  sumQualificationSpend,
} from '@ynab-counter/app-core/rewards-engine/utils/reward-period-qualification';
import {
  createSubcategoryContext,
  normaliseFlagColor,
  resolveSubcategory,
} from '@ynab-counter/app-core/rewards-engine/utils/subcategories';
import { YnabClient, isYnabApiError } from '@ynab-counter/ynab-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

interface AgentRewardsRequest {
  pat?: string;
  syncCode?: string;
  cloudSyncCode?: string;
  budgetId?: string;
  includeBreakdowns?: boolean;
  cardIds?: string[];
  transactions?: AgentTransactionRequest[];
  include?: string[];
  cardsView?: 'full' | 'limits';
}

interface AgentTransactionRequest {
  id?: string;
  description?: string;
  amount: number;
  themeGroupId?: string;
  themeGroupName?: string;
  flagColor?: string;
}

type AdviceStatus = 'use' | 'consider' | 'avoid';

type CardAdviceLimits = {
  totalSpend: number;
  eligibleSpendBeforeBlocks: number;
  maximumExceeded: boolean;
  shouldStopUsing: boolean;
  currentLevelCapReached: boolean;
  subcategorySpendById: Map<string, number>;
};

const ADVICE_PRIORITY: Record<AdviceStatus, number> = {
  use: 3,
  consider: 2,
  avoid: 1,
};

const INCLUDE_KEYS = new Set(['cards', 'signals', 'categories', 'advice', 'alerts']);

type SummaryAvailable = {
  available: true;
  period: string | null | undefined;
  totalSpend: number;
  eligibleSpend: number;
  eligibleSpendBeforeBlocks: number;
  rewardEarned: number;
  rewardEarnedDollars: number;
  rewardType: 'cashback' | 'miles';
  minimumSpend: number | null | undefined;
  minimumMet: boolean;
  minimumProgress: number | null;
  monthlyMinimumSpend: number | null;
  qualificationStatus: RewardQualificationStatus | null;
  monthlyQualifications: MonthlyQualificationBreakdown[];
  maximumSpend: number | null | undefined;
  maximumExceeded: boolean;
  maximumProgress: number | null;
  shouldStopUsing: boolean;
  ruleCount: number;
};

type SummaryUnavailable = {
  available: false;
  reason: string;
};

type SummaryResult = SummaryAvailable | SummaryUnavailable;

type CardStatusAvailable = {
  available: true;
  period: string | null | undefined;
  limits: {
    minimum: {
      target: number | null;
      remaining: number | null;
      progress: number | null;
      met: boolean | null;
    };
    qualification: {
      status: RewardQualificationStatus | null;
      monthlyMinimum: number | null;
      minimumScope: 'each_month' | 'whole_period' | null;
      activeMonth: MonthlyQualificationBreakdown | null;
    };
    maximum: {
      cap: number | null;
      remaining: number | null;
      progress: number | null;
      exceeded: boolean | null;
    };
    nextSpendingTier: {
      threshold: number;
      remaining: number;
    } | null;
    shouldStopUsing: boolean;
  };
  spend?: {
    total: number;
    eligible: number;
    eligibleBeforeBlocks: number;
    rewardEarned: number;
    rewardEarnedDollars: number;
    rewardType: 'cashback' | 'miles';
  };
  rules?: ReturnType<typeof buildRulePayload>;
};

type CardStatusUnavailable = {
  available: false;
  reason: string;
  rules?: ReturnType<typeof buildRulePayload>;
};

type CardStatus = CardStatusAvailable | CardStatusUnavailable;

function isSummaryAvailable(summary: SummaryResult): summary is SummaryAvailable {
  return summary.available;
}

function isStatusAvailable(status: CardStatus): status is CardStatusAvailable {
  return status.available;
}

interface CloudSyncPayload {
  ciphertext: string;
  iv: string;
  updatedAt?: string;
  version?: number;
}

interface CloudflareError {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
}

interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

class AgentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class CloudflareKVError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class AgentYnabClient {
  private client: YnabClient;

  constructor(pat: string) {
    this.client = new YnabClient({ accessToken: pat, maxRetries: 1 });
  }

  async getTransactions(
    budgetId: string,
    options?: { since_date?: string; signal?: AbortSignal }
  ): Promise<TransactionWithRewards[]> {
    const transactions = await this.client.getTransactions(budgetId, {
      sinceDate: options?.since_date,
      signal: options?.signal,
    });
    return transactions as TransactionWithRewards[];
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function extractBearer(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function fetchCloudSyncPayload(keyId: string): Promise<CloudSyncPayload> {
  const stored = await retrieveCloudSyncValue(keyId);

  if (!stored) {
    throw new AgentApiError('Cloud sync backup not found.', 404);
  }

  let parsed: CloudSyncPayload;
  try {
    parsed = JSON.parse(stored) as CloudSyncPayload;
  } catch {
    throw new AgentApiError('Cloud sync payload is malformed.', 500);
  }

  if (!isNonEmptyString(parsed.ciphertext) || !isNonEmptyString(parsed.iv)) {
    throw new AgentApiError('Cloud sync payload is malformed.', 500);
  }

  return parsed;
}

async function getNativeCloudSyncBindings(): Promise<{
  backups: DurableObjectNamespace | null;
  kv: KVNamespace | null;
}> {
  try {
    const ctx = await getCloudflareContext();
    const env = ctx?.env as Record<string, unknown> | undefined;
    const backups = env?.CLOUD_SYNC_BACKUPS;
    const kv = env?.CLOUD_SYNC_KV;
    const validBackups = (
      backups
      && typeof backups === 'object'
      && 'idFromName' in backups
      && typeof (backups as Record<string, unknown>).idFromName === 'function'
      && 'get' in backups
      && typeof (backups as Record<string, unknown>).get === 'function'
    ) ? backups as DurableObjectNamespace : null;
    const validKV = (
      kv &&
      typeof kv === 'object' &&
      'get' in kv &&
      typeof (kv as Record<string, unknown>).get === 'function'
    ) ? kv as KVNamespace : null;
    return { backups: validBackups, kv: validKV };
  } catch {
    return { backups: null, kv: null };
  }
}

async function requestCloudflareKV(key: string): Promise<Response> {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_KV_NAMESPACE_ID || !CLOUDFLARE_API_TOKEN) {
    return new Response('Cloud sync not configured', { status: 501 });
  }

  const endpoint = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(
      key
    )}`
  );

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
  });

  if (!response.ok && process.env.NODE_ENV !== 'production') {
    console.error('Cloud sync KV request failed', {
      method: 'GET',
      status: response.status,
      statusText: response.statusText,
      endpoint: endpoint.href,
    });
  }

  return response;
}

async function retrieveValueREST(key: string): Promise<string | null> {
  const response = await requestCloudflareKV(key);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    let message = bodyText || 'Failed to retrieve cloud sync data';
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as CloudflareError;
        message = parsed?.errors?.[0]?.message || message;
      } catch {
        // Keep plain text body message.
      }
    }
    throw new CloudflareKVError(`Cloudflare (${response.status}): ${message}`, response.status || 502);
  }

  return response.text();
}

async function retrieveCloudSyncValue(key: string): Promise<string | null> {
  const { backups, kv } = await getNativeCloudSyncBindings();
  if (backups) {
    try {
      const id = backups.idFromName(key);
      const response = await backups.get(id).fetch(
        new Request(`https://cloud-sync.internal/api/cloud-sync?key=${encodeURIComponent(key)}`),
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new AgentApiError('Cloud sync storage request failed.', response.status || 502);
      }
      return await response.text();
    } catch (error) {
      if (error instanceof AgentApiError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Failed to retrieve cloud sync data';
      throw new AgentApiError(`Durable Object error: ${message}`, 502);
    }
  }

  if (kv) {
    try {
      return await kv.get(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve cloud sync data';
      throw new AgentApiError(`KV error: ${message}`, 502);
    }
  }

  try {
    return await retrieveValueREST(key);
  } catch (error) {
    if (error instanceof CloudflareKVError) {
      throw new AgentApiError(error.message, error.status);
    }
    throw error;
  }
}

function groupCalculationsByCard(calculations: RewardCalculation[]): Map<string, RewardCalculation[]> {
  const byCard = new Map<string, RewardCalculation[]>();
  calculations.forEach((calc) => {
    const existing = byCard.get(calc.cardId);
    if (existing) {
      existing.push(calc);
    } else {
      byCard.set(calc.cardId, [calc]);
    }
  });
  return byCard;
}

function resolveMax(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

function resolveRewardDollars(calc: RewardCalculation): number {
  if (typeof calc.rewardEarnedDollars === 'number') {
    return calc.rewardEarnedDollars;
  }
  return calc.rewardType === 'cashback' ? calc.rewardEarned : 0;
}

function resolveEligibleBeforeBlocks(calculations: RewardCalculation[]): number {
  const candidate = calculations.find(
    (calc) => Array.isArray(calc.subcategoryBreakdowns) && calc.subcategoryBreakdowns.length > 0
  );

  if (candidate?.subcategoryBreakdowns) {
    return candidate.subcategoryBreakdowns.reduce((sum, breakdown) => {
      const fallback = breakdown.eligibleSpend ?? 0;
      return sum + (breakdown.eligibleSpendBeforeBlocks ?? fallback);
    }, 0);
  }

  return resolveMax(calculations.map((calc) => calc.eligibleSpend));
}

function summariseCalculations(calculations: RewardCalculation[]): SummaryResult {
  if (calculations.length === 0) {
    return {
      available: false,
      reason: 'no_calculations',
    };
  }

  const minProgressValues = calculations
    .map((calc) => (typeof calc.minimumProgress === 'number' ? calc.minimumProgress : null))
    .filter((value): value is number => value !== null);
  const maxProgressValues = calculations
    .map((calc) => (typeof calc.maximumProgress === 'number' ? calc.maximumProgress : null))
    .filter((value): value is number => value !== null);

  const totalSpend = resolveMax(calculations.map((calc) => calc.totalSpend));
  const eligibleSpend = resolveMax(calculations.map((calc) => calc.eligibleSpend));
  const rewardEarned = calculations.reduce((sum, calc) => sum + calc.rewardEarned, 0);
  const rewardEarnedDollars = calculations.reduce((sum, calc) => sum + resolveRewardDollars(calc), 0);
  const cardDefaultCalculation = calculations.find(({ ruleId }) => ruleId.startsWith('card-'));

  return {
    available: true,
    period: resolveLatestPeriod(calculations) ?? null,
    totalSpend,
    eligibleSpend,
    eligibleSpendBeforeBlocks: resolveEligibleBeforeBlocks(calculations),
    rewardEarned,
    rewardEarnedDollars,
    rewardType: calculations[0].rewardType,
    minimumSpend: cardDefaultCalculation?.minimumSpend,
    minimumMet: calculations.every((calc) => calc.minimumMet),
    minimumProgress: minProgressValues.length > 0 ? Math.min(...minProgressValues) : null,
    monthlyMinimumSpend: getPositiveNumber(cardDefaultCalculation?.monthlyMinimumSpend),
    qualificationStatus: cardDefaultCalculation?.qualificationStatus ?? null,
    monthlyQualifications: cardDefaultCalculation?.monthlyQualifications ?? [],
    maximumSpend: cardDefaultCalculation?.maximumSpend,
    maximumExceeded: calculations.some((calc) => calc.maximumExceeded),
    maximumProgress: maxProgressValues.length > 0 ? Math.max(...maxProgressValues) : null,
    shouldStopUsing: calculations.some((calc) => calc.shouldStopUsing),
    ruleCount: calculations.length,
  };
}

function buildRulePayload(
  calculations: RewardCalculation[],
  ruleLookup: Map<string, { id: string; name: string; startDate: string; endDate: string; active: boolean; minimumSpend?: number; maximumSpend?: number }>,
  includeBreakdowns: boolean
) {
  return calculations.map((calc) => {
    const rule = ruleLookup.get(calc.ruleId);
    const isCardDefault = calc.ruleId.startsWith('card-');
    const configuredMinimum = isCardDefault ? calc.minimumSpend : rule?.minimumSpend;
    const configuredMaximum = isCardDefault ? calc.maximumSpend : rule?.maximumSpend;
    const minimumTarget = typeof configuredMinimum === 'number' && configuredMinimum > 0
      ? configuredMinimum
      : null;
    const maximumCap = typeof configuredMaximum === 'number' && configuredMaximum > 0
      ? configuredMaximum
      : null;
    const minimumRemaining = minimumTarget ? Math.max(0, minimumTarget - calc.totalSpend) : null;
    const maximumRemaining = maximumCap ? Math.max(0, maximumCap - calc.eligibleSpend) : null;

    return {
      ruleId: calc.ruleId,
      ruleName: rule?.name ?? (isCardDefault ? 'Card rewards' : 'Reward rule'),
      ruleWindow: rule
        ? {
          startDate: rule.startDate,
          endDate: rule.endDate,
          active: rule.active,
        }
        : null,
      period: calc.period,
      rewardType: calc.rewardType,
      totalSpend: calc.totalSpend,
      eligibleSpend: calc.eligibleSpend,
      eligibleSpendBeforeBlocks: resolveEligibleBeforeBlocks([calc]),
      rewardEarned: calc.rewardEarned,
      rewardEarnedDollars: typeof calc.rewardEarnedDollars === 'number' ? calc.rewardEarnedDollars : null,
      minimumTarget,
      minimumRemaining,
      minimumMet: calc.minimumMet,
      minimumProgress: typeof calc.minimumProgress === 'number' ? calc.minimumProgress : null,
      monthlyMinimumSpend: getPositiveNumber(calc.monthlyMinimumSpend),
      qualificationStatus: calc.qualificationStatus ?? null,
      monthlyQualifications: includeBreakdowns ? calc.monthlyQualifications ?? null : undefined,
      maximumCap,
      maximumRemaining,
      maximumExceeded: calc.maximumExceeded,
      maximumProgress: typeof calc.maximumProgress === 'number' ? calc.maximumProgress : null,
      shouldStopUsing: calc.shouldStopUsing,
      categoryBreakdowns: includeBreakdowns ? calc.categoryBreakdowns ?? null : undefined,
      subcategoryBreakdowns: includeBreakdowns ? calc.subcategoryBreakdowns ?? null : undefined,
    };
  });
}

function mapUnavailableReason(card: CreditCard, hasActiveRules: boolean): string {
  if (!card.ynabAccountId) {
    return 'missing_ynab_account';
  }
  if (!card.subcategoriesEnabled && !hasActiveRules) {
    return 'no_active_rules';
  }
  return 'no_calculations';
}

function getPositiveNumber(value: number | null | undefined): number | null {
  if (typeof value === 'number' && value > 0) {
    return value;
  }
  return null;
}

function buildCardStatus(
  card: CreditCard,
  summary: SummaryAvailable,
  rules: ReturnType<typeof buildRulePayload> | null,
  view: 'full' | 'limits'
): CardStatusAvailable {
  const totalSpend = summary.totalSpend;
  const eligibleSpend = summary.eligibleSpend;
  const eligibleSpendBeforeBlocks = summary.eligibleSpendBeforeBlocks;

  const today = new Date();
  const todayValue = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const activeMonth = summary.monthlyQualifications.find(
    (month) => month.start <= todayValue && month.end >= todayValue,
  ) ?? null;
  const usesPeriodMinimum = isWholePeriodMinimum(card.rewardPeriod);
  const periodQualificationSpend = summary.monthlyQualifications.length
    ? sumQualificationSpend(summary.monthlyQualifications)
    : totalSpend;

  const minimumTarget = usesPeriodMinimum
    ? summary.monthlyMinimumSpend
      ?? getPositiveNumber(card.rewardPeriod?.monthlyMinimumSpend)
    : activeMonth?.minimumSpend
      ?? (summary.minimumSpend === undefined
        ? getPositiveNumber(card.minimumSpend)
        : getPositiveNumber(summary.minimumSpend));
  const minimumProgressSpend = usesPeriodMinimum
    ? periodQualificationSpend
    : activeMonth?.spend ?? totalSpend;
  const minimumRemaining = minimumTarget
    ? Math.max(0, minimumTarget - minimumProgressSpend)
    : null;
  const minimumProgress = minimumTarget
    ? Math.min(100, (minimumProgressSpend / minimumTarget) * 100)
    : null;
  const minimumMet = minimumTarget === null
    ? null
    : usesPeriodMinimum
      ? summary.qualificationStatus === 'met'
      : activeMonth
        ? activeMonth.status === 'met'
        : totalSpend >= minimumTarget;

  const maximumCap = summary.maximumSpend === undefined
    ? getPositiveNumber(card.maximumSpend)
    : getPositiveNumber(summary.maximumSpend);
  const maximumRemaining = maximumCap ? Math.max(0, maximumCap - eligibleSpendBeforeBlocks) : null;
  const maximumProgress = maximumCap ? Math.min(100, (eligibleSpendBeforeBlocks / maximumCap) * 100) : null;
  const maximumExceeded = maximumCap ? eligibleSpendBeforeBlocks >= maximumCap : null;
  const spendingTier = resolveCardSpendingTier(card, totalSpend);
  const hasHigherSpendingLevel = spendingTier.hasNextSpendingTier;
  const terminalMaximumExceeded = maximumExceeded === null
    ? null
    : maximumExceeded && !hasHigherSpendingLevel;
  const shouldStopUsing = Boolean(
    (summary.shouldStopUsing || (maximumExceeded ?? false)) && !hasHigherSpendingLevel,
  );

  const base: CardStatusAvailable = {
    available: true,
    period: summary.period,
    limits: {
      minimum: {
        target: minimumTarget,
        remaining: minimumRemaining,
        progress: minimumProgress,
        met: minimumMet,
      },
      qualification: {
        status: summary.qualificationStatus,
        monthlyMinimum: summary.monthlyMinimumSpend,
        minimumScope: card.rewardPeriod
          ? getRewardPeriodMinimumScope(card.rewardPeriod)
          : null,
        activeMonth,
      },
      maximum: {
        cap: maximumCap,
        remaining: maximumRemaining,
        progress: maximumProgress,
        exceeded: terminalMaximumExceeded,
      },
      nextSpendingTier: spendingTier.hasNextSpendingTier && spendingTier.nextLevel
        ? {
            threshold: spendingTier.nextLevel.spendThreshold,
            remaining: Math.max(0, spendingTier.nextLevel.spendThreshold - totalSpend),
          }
        : null,
      shouldStopUsing,
    },
  };

  if (view === 'limits') {
    return base;
  }

  return {
    ...base,
    spend: {
      total: totalSpend,
      eligible: eligibleSpend,
      eligibleBeforeBlocks: eligibleSpendBeforeBlocks,
      rewardEarned: summary.rewardEarned,
      rewardEarnedDollars: summary.rewardEarnedDollars,
      rewardType: summary.rewardType,
    },
    ...(rules ? { rules } : {}),
  };
}

function normaliseTransactionAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.abs(amount);
}

function spendingLevelChanged(
  current: ReturnType<typeof resolveCardSpendingTier>,
  projected: ReturnType<typeof resolveCardSpendingTier>,
): boolean {
  if ((current.activeLevel === null) !== (projected.activeLevel === null)) {
    return true;
  }
  return current.activeLevel?.id !== projected.activeLevel?.id
    || current.activeLevel?.spendThreshold !== projected.activeLevel?.spendThreshold;
}

function minimumHeadroom(...values: Array<number | null>): number | null {
  const configured = values.filter((value): value is number => value !== null);
  return configured.length > 0 ? Math.min(...configured) : null;
}

function maximumRequirement(...values: Array<number | null>): number | null {
  const configured = values.filter((value): value is number => value !== null);
  return configured.length > 0 ? Math.max(...configured) : null;
}

function projectedCardHeadroom(
  projectedCard: CreditCard,
  limits: CardAdviceLimits | undefined,
  unlockedLevel: boolean,
): number | null {
  const cap = getPositiveNumber(projectedCard.maximumSpend);
  if (cap === null) {
    return null;
  }
  let used = limits?.eligibleSpendBeforeBlocks ?? 0;
  if (unlockedLevel) {
    const context = createSubcategoryContext(projectedCard);
    used = context.enabled
      ? context.activeSubcategories.reduce((total, subcategory) => {
          if (subcategory.excludeFromRewards || subcategory.rewardValue <= 0) {
            return total;
          }
          const spend = limits?.subcategorySpendById.get(subcategory.id) ?? 0;
          const categoryCap = getPositiveNumber(subcategory.maximumSpend);
          return total + (categoryCap === null ? spend : Math.min(spend, categoryCap));
        }, 0)
      : limits?.totalSpend ?? 0;
  }
  return Math.max(0, cap - used);
}

function projectedSubcategoryHeadroom(
  projectedCard: CreditCard,
  limits: CardAdviceLimits | undefined,
  flagColor: string,
): number | null {
  const subcategory = resolveSubcategory(
    createSubcategoryContext(projectedCard),
    normaliseFlagColor(flagColor),
  );
  const cap = getPositiveNumber(subcategory?.maximumSpend);
  if (!subcategory || cap === null) {
    return null;
  }
  return Math.max(0, cap - (limits?.subcategorySpendById.get(subcategory.id) ?? 0));
}

function projectedSubcategoryMinimumRemaining(
  projectedCard: CreditCard,
  limits: CardAdviceLimits | undefined,
  flagColor: string,
  amount: number,
): number | null {
  const subcategory = resolveSubcategory(
    createSubcategoryContext(projectedCard),
    normaliseFlagColor(flagColor),
  );
  const target = getPositiveNumber(subcategory?.minimumSpend);
  if (!subcategory || target === null) {
    return null;
  }
  return Math.max(
    0,
    target - (limits?.subcategorySpendById.get(subcategory.id) ?? 0) - amount,
  );
}

function projectedThemeHeadroom(
  group: ThemeGroup | undefined,
  projectedCard: CreditCard,
  limits: CardAdviceLimits | undefined,
): number | null {
  if (!group) {
    return null;
  }
  const entry = buildCardEntries(group).get(projectedCard.id);
  if (!entry || entry.refs.length === 0) {
    return null;
  }
  const subcategories = new Map(
    projectedCard.subcategories?.map((subcategory) => [subcategory.id, subcategory] as const) ?? [],
  );
  const headrooms = entry.refs.flatMap(({ subcategoryId }) => {
    const subcategory = subcategories.get(subcategoryId);
    const cap = getPositiveNumber(subcategory?.maximumSpend);
    return subcategory && subcategory.active !== false && !subcategory.excludeFromRewards && cap !== null
      ? [Math.max(0, cap - (limits?.subcategorySpendById.get(subcategoryId) ?? 0))]
      : [];
  });
  return headrooms.length > 0 ? Math.min(...headrooms) : null;
}

function normalizedRewardRate(
  card: CreditCard,
  nativeRate: number,
  settings?: StorageData['settings'],
): number {
  if (card.type === 'cashback') {
    return nativeRate / 100;
  }
  const milesValuation = typeof settings?.milesValuation === 'number'
    ? settings.milesValuation
    : 0.01;
  return nativeRate * milesValuation;
}

function projectedThemeRewardRate(
  group: ThemeGroup | undefined,
  projectedCard: CreditCard,
  fallbackRate: number,
  settings?: StorageData['settings'],
): number {
  if (!group) {
    return fallbackRate;
  }
  const entry = buildCardEntries(group).get(projectedCard.id);
  if (!entry) {
    return fallbackRate;
  }
  if (entry.refs.length === 0) {
    return typeof projectedCard.earningRate === 'number'
      ? normalizedRewardRate(projectedCard, projectedCard.earningRate, settings)
      : fallbackRate;
  }
  const subcategories = new Map(
    projectedCard.subcategories?.map((subcategory) => [subcategory.id, subcategory] as const) ?? [],
  );
  const rates = entry.refs.flatMap(({ subcategoryId }) => {
    const subcategory = subcategories.get(subcategoryId);
    return subcategory && subcategory.active !== false && !subcategory.excludeFromRewards
      ? [normalizedRewardRate(projectedCard, subcategory.rewardValue, settings)]
      : [];
  });
  return rates.length > 0
    ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    : fallbackRate;
}

function buildTransactionReasons(params: {
  rewardRate?: number | null;
  rewardRateLabel?: string | null;
  minimumRemaining?: number | null;
  maximumRemaining?: number | null;
  currentLevelCapReached?: boolean;
  nextSpendingTierRemaining?: number | null;
  capped: boolean;
}): string[] {
  const reasons: string[] = [];
  if (params.rewardRateLabel) {
    reasons.push(`Reward rate ${params.rewardRateLabel}`);
  } else if (typeof params.rewardRate === 'number') {
    reasons.push(`Reward rate ${(params.rewardRate * 100).toFixed(2)}%`);
  }
  if (typeof params.minimumRemaining === 'number' && params.minimumRemaining > 0) {
    reasons.push(`${params.minimumRemaining.toFixed(2)} dollars to reach minimum spend`);
  }
  if (typeof params.maximumRemaining === 'number') {
    if (params.capped) {
      reasons.push('Maximum spend reached');
    } else {
      reasons.push(`${params.maximumRemaining.toFixed(2)} dollars headroom to max`);
    }
  }
  if (
    params.currentLevelCapReached
    && typeof params.nextSpendingTierRemaining === 'number'
  ) {
    reasons.push(
      `Current level capped; ${params.nextSpendingTierRemaining.toFixed(2)} dollars to next spend tier`,
    );
  }
  return reasons;
}

function buildTransactionAdvice(params: {
  transactions: AgentTransactionRequest[];
  cards: CreditCard[];
  cardLimitLookup: Map<string, CardAdviceLimits>;
  categoryRecommendations: Array<{ groupId: string; groupName: string; insights: Array<{ cardId: string; cardName: string; rewardRate: number; minimumRemaining?: number | null; headroomToMaximum?: number | null; shouldAvoid: boolean; status: AdviceStatus }> }>;
  themeGroups: ThemeGroup[];
  settings?: StorageData['settings'];
}) {
  const groupById = new Map(params.categoryRecommendations.map((rec) => [rec.groupId, rec]));
  const groupByName = new Map(
    params.categoryRecommendations.map((rec) => [rec.groupName.toLowerCase(), rec])
  );
  const cardById = new Map(params.cards.map((card) => [card.id, card]));
  const themeGroupById = new Map(params.themeGroups.map((group) => [group.id, group]));

  return params.transactions.map((txn) => {
    const amount = normaliseTransactionAmount(txn.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        id: txn.id ?? null,
        description: txn.description ?? null,
        amount,
        error: 'invalid_amount',
      };
    }

    if (txn.themeGroupId || txn.themeGroupName) {
      const group = txn.themeGroupId
        ? groupById.get(txn.themeGroupId)
        : groupByName.get((txn.themeGroupName ?? '').toLowerCase());

      if (!group) {
        return {
          id: txn.id ?? null,
          description: txn.description ?? null,
          amount,
          error: 'theme_group_not_found',
        };
      }

      const themeGroup = themeGroupById.get(group.groupId);
      const ranked = group.insights.map((insight) => {
        const card = cardById.get(insight.cardId);
        const limits = params.cardLimitLookup.get(insight.cardId);
        if (!card) {
          return {
            cardId: insight.cardId,
            cardName: insight.cardName,
            status: 'avoid' as const,
            rewardRate: insight.rewardRate,
            minimumRemaining: insight.minimumRemaining ?? null,
            maximumRemaining: insight.headroomToMaximum ?? null,
            reasons: ['Missing YNAB account mapping'],
          };
        }

        const currentSpendingTier = resolveCardSpendingTier(
          card,
          limits?.totalSpend ?? 0,
        );
        const projectedSpendingTier = resolveCardSpendingTier(
          card,
          (limits?.totalSpend ?? 0) + amount,
        );
        const unlockedLevel = spendingLevelChanged(
          currentSpendingTier,
          projectedSpendingTier,
        );
        const effectiveCard = projectedSpendingTier.effectiveCard;
        const maximumRemaining = minimumHeadroom(
          projectedCardHeadroom(effectiveCard, limits, unlockedLevel),
          projectedThemeHeadroom(themeGroup, effectiveCard, limits),
        );
        const projectedMinimum = getPositiveNumber(effectiveCard.minimumSpend);
        const cardMinimumRemaining = projectedMinimum === null
          ? null
          : Math.max(0, projectedMinimum - (limits?.totalSpend ?? 0) - amount);
        const themeMinimumRemaining = typeof insight.minimumRemaining === 'number'
          ? Math.max(0, insight.minimumRemaining - amount)
          : null;
        const minimumRemaining = maximumRequirement(
          cardMinimumRemaining,
          themeMinimumRemaining,
        );
        const rewardRate = projectedThemeRewardRate(
          themeGroup,
          effectiveCard,
          insight.rewardRate,
          params.settings,
        );
        const earnableAmount = maximumRemaining === null
          ? amount
          : Math.min(amount, maximumRemaining);
        const effectiveRewardRate = amount > 0
          ? rewardRate * (earnableAmount / amount)
          : 0;

        let status: AdviceStatus = typeof minimumRemaining === 'number' && minimumRemaining > 0
          ? 'consider'
          : 'use';
        let capped = false;

        if (!card.ynabAccountId) {
          status = 'avoid';
        } else if (
          !unlockedLevel
          && (insight.shouldAvoid || limits?.shouldStopUsing || limits?.maximumExceeded)
        ) {
          status = 'avoid';
          capped = true;
        }

        if (typeof maximumRemaining === 'number' && amount > maximumRemaining) {
          const canProgress = projectedSpendingTier.hasNextSpendingTier;
          status = canProgress ? 'consider' : 'avoid';
          capped = !canProgress;
        }

        if (typeof minimumRemaining === 'number' && minimumRemaining > 0 && status === 'use') {
          status = 'consider';
        }

        const baseReasons = buildTransactionReasons({
          rewardRate: effectiveRewardRate,
          minimumRemaining,
          maximumRemaining,
          currentLevelCapReached: limits?.currentLevelCapReached,
          nextSpendingTierRemaining: projectedSpendingTier.hasNextSpendingTier
            && projectedSpendingTier.nextLevel
            ? Math.max(
                0,
                projectedSpendingTier.nextLevel.spendThreshold
                  - (limits?.totalSpend ?? 0)
                  - amount,
              )
            : null,
          capped,
        });

        const reasons = card.ynabAccountId ? baseReasons : ['Missing YNAB account mapping'];

        return {
          cardId: insight.cardId,
          cardName: insight.cardName,
          status,
          rewardRate: effectiveRewardRate,
          minimumRemaining,
          maximumRemaining,
          reasons,
        };
      });

      ranked.sort((a, b) => {
        const statusDiff = ADVICE_PRIORITY[b.status] - ADVICE_PRIORITY[a.status];
        if (statusDiff !== 0) return statusDiff;
        return b.rewardRate - a.rewardRate;
      });

      const recommended = ranked.find((entry) => entry.status !== 'avoid') ?? ranked[0] ?? null;

      return {
        id: txn.id ?? null,
        description: txn.description ?? null,
        amount,
        method: 'theme_group',
        group: { id: group.groupId, name: group.groupName },
        recommended,
        ranked,
      };
    }

    if (txn.flagColor) {
      const flagColor = txn.flagColor;
      const ranked = params.cards.map((card) => {
        const limits = params.cardLimitLookup.get(card.id);
        const currentSpendingTier = resolveCardSpendingTier(
          card,
          limits?.totalSpend ?? 0,
        );
        const projectedSpendingTier = resolveCardSpendingTier(
          card,
          (limits?.totalSpend ?? 0) + amount,
        );
        const unlockedLevel = spendingLevelChanged(
          currentSpendingTier,
          projectedSpendingTier,
        );
        const effectiveCard = projectedSpendingTier.effectiveCard;
        const maximumRemaining = minimumHeadroom(
          projectedCardHeadroom(effectiveCard, limits, unlockedLevel),
          projectedSubcategoryHeadroom(effectiveCard, limits, flagColor),
        );
        const earnableAmount = maximumRemaining === null
          ? amount
          : Math.min(amount, maximumRemaining);
        const reward = SimpleRewardsCalculator.calculateTransactionReward(
          earnableAmount,
          effectiveCard,
          params.settings,
          { flagColor },
        );
        const effectiveRate = amount > 0 ? reward.rewardDollars / amount : 0;
        const projectedMinimum = getPositiveNumber(effectiveCard.minimumSpend);
        const cardMinimumRemaining = projectedMinimum === null
          ? null
          : Math.max(0, projectedMinimum - (limits?.totalSpend ?? 0) - amount);
        const categoryMinimumRemaining = projectedSubcategoryMinimumRemaining(
          effectiveCard,
          limits,
          flagColor,
          amount,
        );
        const minimumRemaining = maximumRequirement(
          cardMinimumRemaining,
          categoryMinimumRemaining,
        );

        let status: AdviceStatus = 'use';
        let capped = false;

        if (!card.ynabAccountId) {
          status = 'avoid';
        } else if (!unlockedLevel && (limits?.shouldStopUsing || limits?.maximumExceeded)) {
          status = 'avoid';
          capped = true;
        } else if (typeof maximumRemaining === 'number' && amount > maximumRemaining) {
          const canProgress = projectedSpendingTier.hasNextSpendingTier;
          status = canProgress ? 'consider' : 'avoid';
          capped = !canProgress;
        } else if (typeof minimumRemaining === 'number' && minimumRemaining > 0) {
          status = 'consider';
        }

        const effectiveNativeRate = reward.rewardRate * (earnableAmount / amount);
        const rewardRateLabel = card.type === 'cashback'
          ? `${effectiveNativeRate.toFixed(2)}% cashback`
          : `${effectiveNativeRate.toFixed(2)} miles/$`;

        const baseReasons = buildTransactionReasons({
          rewardRate: effectiveRate,
          rewardRateLabel,
          minimumRemaining,
          maximumRemaining,
          currentLevelCapReached: limits?.currentLevelCapReached,
          nextSpendingTierRemaining: projectedSpendingTier.hasNextSpendingTier
            && projectedSpendingTier.nextLevel
            ? Math.max(
                0,
                projectedSpendingTier.nextLevel.spendThreshold
                  - (limits?.totalSpend ?? 0)
                  - amount,
              )
            : null,
          capped,
        });

        const reasons = card.ynabAccountId ? baseReasons : ['Missing YNAB account mapping'];

        return {
          cardId: card.id,
          cardName: card.name,
          status,
          rewardRate: effectiveRate,
          rewardEarned: reward.reward,
          rewardEarnedDollars: reward.rewardDollars,
          blockInfo: reward.blockInfo ?? null,
          minimumRemaining,
          maximumRemaining,
          reasons,
        };
      });

      ranked.sort((a, b) => {
        const statusDiff = ADVICE_PRIORITY[b.status] - ADVICE_PRIORITY[a.status];
        if (statusDiff !== 0) return statusDiff;
        return b.rewardRate - a.rewardRate;
      });

      const recommended = ranked.find((entry) => entry.status !== 'avoid') ?? ranked[0] ?? null;

      return {
        id: txn.id ?? null,
        description: txn.description ?? null,
        amount,
        method: 'flag_color',
        flagColor,
        recommended,
        ranked,
      };
    }

    return {
      id: txn.id ?? null,
      description: txn.description ?? null,
      amount,
      error: 'missing_theme_group_or_flag_color',
    };
  });
}

export async function POST(request: Request) {
  let body: AgentRewardsRequest = {};

  try {
    body = (await request.json()) as AgentRewardsRequest;
  } catch {
    body = {};
  }

  const pat =
    (isNonEmptyString(body.pat) ? body.pat.trim() : null) ??
    extractBearer(request.headers.get('authorization')) ??
    request.headers.get('x-ynab-pat');
  const syncCode =
    (isNonEmptyString(body.syncCode) ? body.syncCode.trim() : null) ??
    (isNonEmptyString(body.cloudSyncCode) ? body.cloudSyncCode.trim() : null) ??
    request.headers.get('x-cloud-sync-code');

  if (!isNonEmptyString(syncCode)) {
    return jsonError('Missing cloud sync code (12-word phrase).', 400);
  }

  if (!isNonEmptyString(pat)) {
    return jsonError('Missing YNAB personal access token.', 400);
  }

  const includeBreakdowns = Boolean(body.includeBreakdowns);
  const cardsView: 'full' | 'limits' = body.cardsView === 'limits' ? 'limits' : 'full';
  const cardIds = Array.isArray(body.cardIds) ? body.cardIds.filter(isNonEmptyString) : null;
  const includeSet = new Set(
    Array.isArray(body.include)
      ? body.include
          .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
          .filter((entry) => INCLUDE_KEYS.has(entry))
      : []
  );
  const includeAll = includeSet.size === 0;
  const includeCards = includeAll || includeSet.has('cards');
  const includeSignals = includeAll || includeSet.has('signals');
  const includeCategories = includeAll || includeSet.has('categories');
  const includeAlerts = includeAll || includeSet.has('alerts');
  const includeAdvice = includeAll || includeSet.has('advice');

  try {
    const keyId = await computeKeyId(syncCode);
    const encryptedPayload = await fetchCloudSyncPayload(keyId);
    let storage: StorageData;
    try {
      storage = await decryptJson<StorageData>(syncCode, encryptedPayload.ciphertext, encryptedPayload.iv);
    } catch {
      throw new AgentApiError('Cloud sync code is invalid for this backup.', 401);
    }

    const budgetId = isNonEmptyString(body.budgetId)
      ? body.budgetId.trim()
      : storage.ynab?.selectedBudgetId;

    if (!budgetId) {
      return jsonError('No budget selected in cloud sync data. Provide budgetId in the request.', 400);
    }

    const cards = (storage.cards ?? []).filter((card) => !cardIds || cardIds.includes(card.id));
    const rules = storage.rules ?? [];
    const ruleLookup = new Map(rules.map((rule) => [rule.id, rule]));
    const hiddenLookup = new Map((storage.hiddenCards ?? []).map((entry) => [entry.cardId, entry]));

    const calculations = await computeCurrentPeriod(
      new AgentYnabClient(pat),
      budgetId,
      cards,
      rules,
      storage.settings ?? undefined,
      request.signal
    );

    const calculationsByCard = groupCalculationsByCard(calculations);
    const recommendations = getCardRecommendations(cards, calculations);
    const recommendationsByCard = new Map(recommendations.map((rec) => [rec.cardId, rec]));
    const alerts = includeAlerts ? getAlertRecommendations(cards, calculations) : [];
    const categoryRecommendations = (includeCategories || includeAdvice)
      ? RecommendationEngine.generateCategoryRecommendations(
          cards,
          calculations,
          storage.themeGroups ?? [],
          storage.settings ?? undefined
        )
      : [];

    const minimumSpendNeeded: Array<{
      cardId: string;
      cardName: string;
      remaining: number;
      scope: 'card' | 'rule';
      ruleId?: string;
      ruleName?: string;
    }> = [];

    const maximumSpendHeadroom: Array<{
      cardId: string;
      cardName: string;
      remaining: number;
      cap: number;
      progress: number | null;
    }> = [];

    const maximumSpendReached: Array<{
      cardId: string;
      cardName: string;
      cap: number | null;
    }> = [];

    const cardLimitLookup = new Map<string, CardAdviceLimits>();

    const cardsPayload = cards.map((card) => {
      const cardCalculations = calculationsByCard.get(card.id) ?? [];
      const activeRules = rules.filter((rule) => rule.cardId === card.id && rule.active);
      const summary = summariseCalculations(cardCalculations);
      const hidden = hiddenLookup.get(card.id);
      const rulesPayloadForSignals = includeSignals
        ? buildRulePayload(cardCalculations, ruleLookup, false)
        : [];
      const rulesPayload = cardsView === 'full'
        ? buildRulePayload(cardCalculations, ruleLookup, includeBreakdowns)
        : null;

      const status: CardStatus = isSummaryAvailable(summary)
        ? buildCardStatus(card, summary, rulesPayload, cardsView)
        : {
            available: false,
            reason: mapUnavailableReason(card, activeRules.length > 0),
            ...(cardsView === 'full' && rulesPayload ? { rules: rulesPayload } : {}),
          };

      if (isStatusAvailable(status)) {
        const totalSpend = isSummaryAvailable(summary) ? summary.totalSpend : 0;
        const spendingTier = resolveCardSpendingTier(card, totalSpend);
        const cardCalculation = cardCalculations.find(
          ({ ruleId }) => ruleId.startsWith('card-'),
        );
        const minimumRemaining = status.limits.minimum.remaining;
        if (
          status.limits.qualification.status !== 'failed' &&
          typeof minimumRemaining === 'number' &&
          minimumRemaining > 0
        ) {
          minimumSpendNeeded.push({
            cardId: card.id,
            cardName: card.name,
            remaining: minimumRemaining,
            scope: 'card',
          });
        }

        if (
          !spendingTier.hasNextSpendingTier
          && status.limits.maximum.cap
          && typeof status.limits.maximum.remaining === 'number'
        ) {
          maximumSpendHeadroom.push({
            cardId: card.id,
            cardName: card.name,
            remaining: status.limits.maximum.remaining,
            cap: status.limits.maximum.cap,
            progress: status.limits.maximum.progress ?? null,
          });
        }

        if (status.limits.shouldStopUsing || status.limits.maximum.exceeded) {
          maximumSpendReached.push({
            cardId: card.id,
            cardName: card.name,
            cap: status.limits.maximum.cap,
          });
        }

        cardLimitLookup.set(card.id, {
          totalSpend,
          eligibleSpendBeforeBlocks: isSummaryAvailable(summary)
            ? summary.eligibleSpendBeforeBlocks
            : 0,
          maximumExceeded: Boolean(status.limits.maximum.exceeded),
          shouldStopUsing: status.limits.shouldStopUsing,
          currentLevelCapReached: Boolean(
            status.limits.maximum.cap
            && status.limits.maximum.remaining === 0,
          ),
          subcategorySpendById: new Map(
            cardCalculation?.subcategoryBreakdowns?.map((breakdown) => [
              breakdown.subcategoryId,
              breakdown.totalSpend,
            ] as const) ?? [],
          ),
        });
      }

      if (includeSignals && rulesPayloadForSignals.length > 0) {
        rulesPayloadForSignals.forEach((rule) => {
          if (typeof rule.minimumRemaining === 'number' && rule.minimumRemaining > 0) {
            minimumSpendNeeded.push({
              cardId: card.id,
              cardName: card.name,
              remaining: rule.minimumRemaining,
              scope: 'rule',
              ruleId: rule.ruleId,
              ruleName: rule.ruleName,
            });
          }
        });
      }

      const base = {
        id: card.id,
        name: card.name,
        issuer: card.issuer,
        type: card.type,
        hidden: Boolean(hidden),
        hiddenUntil: hidden?.hiddenUntil ?? null,
        hiddenReason: hidden?.reason ?? null,
        status,
        recommendation: recommendationsByCard.get(card.id) ?? null,
      };

      if (cardsView === 'limits') {
        return base;
      }

      return {
        ...base,
        ynabAccountId: card.ynabAccountId,
        featured: card.featured,
        billingCycle: card.billingCycle ?? null,
      };
    });

    if (includeSignals) {
      minimumSpendNeeded.sort((a, b) => a.remaining - b.remaining);
      maximumSpendHeadroom.sort((a, b) => a.remaining - b.remaining);
    }

    const transactionAdvice = includeAdvice && Array.isArray(body.transactions) && body.transactions.length > 0
      ? buildTransactionAdvice({
          transactions: body.transactions,
          cards,
          cardLimitLookup,
          categoryRecommendations,
          themeGroups: storage.themeGroups ?? [],
          settings: storage.settings ?? undefined,
        })
      : null;

    const response = NextResponse.json({
      meta: {
        generatedAt: new Date().toISOString(),
        budgetId,
        budgetName: storage.ynab?.selectedBudgetName ?? null,
        calculationSource: 'fresh',
        cloudSyncUpdatedAt: encryptedPayload.updatedAt ?? null,
        cardsCount: cards.length,
        rulesCount: rules.length,
      },
      settings: {
        currency: storage.settings?.currency ?? null,
        milesValuation: storage.settings?.milesValuation ?? null,
      },
      ...(includeSignals
        ? {
            signals: {
              minimumSpendNeeded,
              maximumSpendHeadroom,
              maximumSpendReached,
            },
          }
        : {}),
      ...(includeCategories ? { categories: categoryRecommendations } : {}),
      ...(includeCards ? { cards: cardsPayload } : {}),
      ...(includeAdvice ? { transactionAdvice } : {}),
      ...(includeAlerts ? { alerts } : {}),
    });
    response.headers.set('X-Agent-Api-Include', includeAll ? 'all' : Array.from(includeSet).sort().join(','));
    response.headers.set('X-Agent-Api-Cards-View', cardsView);
    return response;
  } catch (error) {
    if (error instanceof AgentApiError) {
      return jsonError(error.message, error.status);
    }
    if (isYnabApiError(error)) {
      const status = error.status ?? (error.code === 'invalid_token' ? 401 : error.code === 'rate_limited' ? 429 : 502);
      return jsonError(error.message, status);
    }
    const message = error instanceof Error ? error.message : 'Failed to compute rewards.';
    return jsonError(message, 500);
  }
}

export async function GET() {
  return jsonError('Use POST with a JSON body to request agent data.', 405);
}
