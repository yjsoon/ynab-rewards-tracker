import { NextResponse } from 'next/server';

import { computeKeyId, decryptJson } from '@/lib/cloud-sync/encryption';
import type { StorageData, RewardCalculation, CreditCard } from '@ynab-counter/app-core/storage/types';
import type { TransactionWithRewards } from '@ynab-counter/app-core/storage/types';
import { computeCurrentPeriod, RecommendationEngine, SimpleRewardsCalculator } from '@ynab-counter/app-core/rewards-engine';
import { getAlertRecommendations, getCardRecommendations } from '@ynab-counter/app-core/rewards-engine/utils/card-recommendations';
import { resolveLatestPeriod } from '@ynab-counter/app-core/rewards-engine/utils/recommendation-helpers';
import { YnabClient, isYnabApiError } from '@ynab-counter/ynab-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  minimumMet: boolean;
  minimumProgress: number | null;
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
    maximum: {
      cap: number | null;
      remaining: number | null;
      progress: number | null;
      exceeded: boolean | null;
    };
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

class AgentApiError extends Error {
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

async function fetchCloudSyncPayload(origin: string, keyId: string): Promise<CloudSyncPayload> {
  const url = new URL('/api/cloud-sync', origin);
  url.searchParams.set('key', keyId);

  const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });

  if (response.status === 404) {
    throw new AgentApiError('Cloud sync backup not found.', 404);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AgentApiError(text || 'Failed to fetch cloud sync backup.', response.status);
  }

  return response.json() as Promise<CloudSyncPayload>;
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

  return {
    available: true,
    period: resolveLatestPeriod(calculations) ?? null,
    totalSpend,
    eligibleSpend,
    eligibleSpendBeforeBlocks: resolveEligibleBeforeBlocks(calculations),
    rewardEarned,
    rewardEarnedDollars,
    rewardType: calculations[0].rewardType,
    minimumMet: calculations.every((calc) => calc.minimumMet),
    minimumProgress: minProgressValues.length > 0 ? Math.min(...minProgressValues) : null,
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
    const minimumTarget = typeof rule?.minimumSpend === 'number' && rule.minimumSpend > 0 ? rule.minimumSpend : null;
    const maximumCap = typeof rule?.maximumSpend === 'number' && rule.maximumSpend > 0 ? rule.maximumSpend : null;
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

  const minimumTarget = getPositiveNumber(card.minimumSpend);
  const minimumRemaining = minimumTarget ? Math.max(0, minimumTarget - totalSpend) : null;
  const minimumProgress = minimumTarget ? Math.min(100, (totalSpend / minimumTarget) * 100) : null;
  const minimumMet = minimumTarget === null ? null : totalSpend >= minimumTarget;

  const maximumCap = getPositiveNumber(card.maximumSpend);
  const maximumRemaining = maximumCap ? Math.max(0, maximumCap - eligibleSpendBeforeBlocks) : null;
  const maximumProgress = maximumCap ? Math.min(100, (eligibleSpendBeforeBlocks / maximumCap) * 100) : null;
  const maximumExceeded = maximumCap ? eligibleSpendBeforeBlocks >= maximumCap : null;

  const shouldStopUsing = Boolean(summary.shouldStopUsing || (maximumExceeded ?? false));

  const base = {
    available: true,
    period: summary.period,
    limits: {
      minimum: {
        target: minimumTarget,
        remaining: minimumRemaining,
        progress: minimumProgress,
        met: minimumMet,
      },
      maximum: {
        cap: maximumCap,
        remaining: maximumRemaining,
        progress: maximumProgress,
        exceeded: maximumExceeded,
      },
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

function buildTransactionReasons(params: {
  rewardRate?: number | null;
  rewardRateLabel?: string | null;
  minimumRemaining?: number | null;
  maximumRemaining?: number | null;
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
  return reasons;
}

function buildTransactionAdvice(params: {
  transactions: AgentTransactionRequest[];
  cards: CreditCard[];
  cardLimitLookup: Map<string, { minimumRemaining: number | null; maximumRemaining: number | null; maximumExceeded: boolean; shouldStopUsing: boolean }>;
  categoryRecommendations: Array<{ groupId: string; groupName: string; insights: Array<{ cardId: string; cardName: string; rewardRate: number; minimumRemaining?: number | null; headroomToMaximum?: number | null; shouldAvoid: boolean; status: AdviceStatus }> }>;
  settings?: StorageData['settings'];
}) {
  const groupById = new Map(params.categoryRecommendations.map((rec) => [rec.groupId, rec]));
  const groupByName = new Map(
    params.categoryRecommendations.map((rec) => [rec.groupName.toLowerCase(), rec])
  );
  const cardById = new Map(params.cards.map((card) => [card.id, card]));

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

      const ranked = group.insights.map((insight) => {
        const card = cardById.get(insight.cardId);
        const limits = params.cardLimitLookup.get(insight.cardId);
        const maximumRemaining = limits?.maximumRemaining ?? insight.headroomToMaximum ?? null;
        const minimumRemaining = limits?.minimumRemaining ?? insight.minimumRemaining ?? null;

        let status: AdviceStatus = insight.status;
        let capped = false;

        if (!card?.ynabAccountId) {
          status = 'avoid';
        } else if (insight.shouldAvoid || limits?.shouldStopUsing || limits?.maximumExceeded) {
          status = 'avoid';
          capped = true;
        }

        if (typeof maximumRemaining === 'number' && amount > maximumRemaining) {
          status = 'avoid';
          capped = true;
        }

        if (typeof minimumRemaining === 'number' && minimumRemaining > 0 && status === 'use') {
          status = 'consider';
        }

        const baseReasons = buildTransactionReasons({
          rewardRate: insight.rewardRate,
          minimumRemaining,
          maximumRemaining,
          capped,
        });

        const reasons = card?.ynabAccountId ? baseReasons : ['Missing YNAB account mapping'];

        return {
          cardId: insight.cardId,
          cardName: insight.cardName,
          status,
          rewardRate: insight.rewardRate,
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
      const ranked = params.cards.map((card) => {
        const reward = SimpleRewardsCalculator.calculateTransactionReward(amount, card, params.settings, {
          flagColor: txn.flagColor,
        });

        const effectiveRate = amount > 0 ? reward.rewardDollars / amount : 0;
        const limits = params.cardLimitLookup.get(card.id);
        const maximumRemaining = limits?.maximumRemaining ?? null;
        const minimumRemaining = limits?.minimumRemaining ?? null;

        let status: AdviceStatus = 'use';
        let capped = false;

        if (!card.ynabAccountId) {
          status = 'avoid';
        } else if (limits?.shouldStopUsing || limits?.maximumExceeded) {
          status = 'avoid';
          capped = true;
        } else if (typeof maximumRemaining === 'number' && amount > maximumRemaining) {
          status = 'avoid';
          capped = true;
        } else if (typeof minimumRemaining === 'number' && minimumRemaining > 0) {
          status = 'consider';
        }

        const rewardRateLabel = card.type === 'cashback'
          ? `${reward.rewardRate.toFixed(2)}% cashback`
          : `${reward.rewardRate.toFixed(2)} miles/$`;

        const baseReasons = buildTransactionReasons({
          rewardRate: effectiveRate,
          rewardRateLabel,
          minimumRemaining,
          maximumRemaining,
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
        flagColor: txn.flagColor,
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
    const origin = new URL(request.url).origin;
    const encryptedPayload = await fetchCloudSyncPayload(origin, keyId);
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

    const cardLimitLookup = new Map<
      string,
      {
        minimumRemaining: number | null;
        maximumRemaining: number | null;
        maximumExceeded: boolean;
        shouldStopUsing: boolean;
      }
    >();

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
        const minimumRemaining = status.limits.minimum.remaining;
        if (typeof minimumRemaining === 'number' && minimumRemaining > 0) {
          minimumSpendNeeded.push({
            cardId: card.id,
            cardName: card.name,
            remaining: minimumRemaining,
            scope: 'card',
          });
        }

        if (status.limits.maximum.cap && typeof status.limits.maximum.remaining === 'number') {
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
          minimumRemaining: status.limits.minimum.remaining ?? null,
          maximumRemaining: status.limits.maximum.remaining ?? null,
          maximumExceeded: Boolean(status.limits.maximum.exceeded),
          shouldStopUsing: status.limits.shouldStopUsing,
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
