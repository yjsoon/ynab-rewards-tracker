import type {
  CardDashboardProjection,
  CardPortfolioStatus,
} from '@ynab-counter/app-core/rewards-engine';
import type { AppSettings, CreditCard } from '@ynab-counter/app-core/storage';
import {
  formatCurrency as formatCurrencyCore,
  normalizeCurrencyCode,
} from '@ynab-counter/app-core/utils/currency';
import type { CardStatusDescriptor } from '@/components/native';
import { semanticColors } from '@/theme';
import type { ColorValue } from 'react-native';

export interface CardFormatting {
  currency: string;
  currencyCompact: (value: number) => string;
  currencyExact: (value: number) => string;
  number: (value: number) => string;
}

export function createCardFormatting(settings: AppSettings): CardFormatting {
  const currency = normalizeCurrencyCode(settings.currency);
  const locale = 'en-GB';

  return {
    currency,
    currencyCompact: (value) => formatCurrencyCore(value, {
      locale,
      currency,
      decimals: Math.abs(value) >= 100 ? 0 : 2,
    }),
    currencyExact: (value) => formatCurrencyCore(value, {
      locale,
      currency,
      decimals: 2,
    }),
    number: (value) => new Intl.NumberFormat(locale, {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value),
  };
}

export function formatReward(
  projection: Pick<CardDashboardProjection, 'reward'>,
  formatting: CardFormatting,
): string {
  if (projection.reward.type === 'cashback') {
    return formatting.currencyExact(projection.reward.amount);
  }
  return `${formatting.number(projection.reward.amount)} miles · ≈ ${formatting.currencyExact(projection.reward.dollars)}`;
}

export function formatRewardForCard(
  card: CreditCard,
  rewardAmount: number,
  rewardDollars: number,
  formatting: CardFormatting,
): string {
  if (card.type === 'cashback') {
    return formatting.currencyExact(rewardAmount);
  }
  return `${formatting.number(rewardAmount)} miles · ≈ ${formatting.currencyExact(rewardDollars)}`;
}

export function formatRate(
  card: Pick<CreditCard, 'type' | 'earningRate'>,
  formatting: Pick<CardFormatting, 'currency'>,
): string {
  const rate = card.earningRate;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    return 'Rate needed';
  }
  const formatted = new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 2,
  }).format(rate);
  return card.type === 'cashback'
    ? `${formatted}% cashback`
    : `${formatted} ${rate === 1 ? 'mile' : 'miles'}/${formatting.currency} 1`;
}

export function formatPeriod(period: CardDashboardProjection['period']): string {
  const start = new Date(`${period.start}T12:00:00`);
  const end = new Date(`${period.end}T12:00:00`);
  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

export function formatResetDate(dateValue: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateValue}T12:00:00`));
}

export function formatDaysRemaining(days: number, resetsOn: string): string {
  const daysLabel = days === 0 ? 'Resets today' : `${days} ${days === 1 ? 'day' : 'days'} left`;
  return `${daysLabel} · resets ${formatResetDate(resetsOn)}`;
}

export function statusPresentation(status: CardPortfolioStatus): CardStatusDescriptor {
  switch (status) {
    case 'unconfigured':
      return { label: 'Needs setup', tone: 'attention' };
    case 'building':
      return { label: 'Building minimum', tone: 'attention' };
    case 'earning':
      return { label: 'Earning', tone: 'positive' };
    case 'near_cap':
      return { label: 'Near cap', tone: 'attention' };
    case 'capped':
      return { label: 'Cap reached', tone: 'capped' };
    case 'open':
      return { label: 'Tracking', tone: 'accent' };
  }
}

export function primaryProgress(projection: CardDashboardProjection): {
  spend: number;
  minimum: number | null;
  maximum: number | null;
} {
  if (projection.status === 'unconfigured') {
    return { spend: projection.spend.total, minimum: null, maximum: null };
  }
  if (projection.status === 'building' && projection.minimum.target) {
    return {
      spend: projection.progress.minimumProgressSpend,
      minimum: projection.minimum.target,
      maximum: null,
    };
  }
  if (projection.maximum.target) {
    return {
      spend: projection.progress.maximumProgressSpend,
      minimum: null,
      maximum: projection.maximum.target,
    };
  }
  return {
    spend: projection.progress.minimumProgressSpend,
    minimum: projection.minimum.target,
    maximum: null,
  };
}

export function attentionCopy(
  projection: CardDashboardProjection,
  formatting: CardFormatting,
): string {
  switch (projection.status) {
    case 'unconfigured':
      return 'Add an earning rate to start tracking rewards.';
    case 'building':
      return `${formatting.currencyCompact(projection.minimum.remaining ?? 0)} more to unlock rewards.`;
    case 'near_cap':
      return `${formatting.currencyCompact(projection.maximum.remaining ?? 0)} left before the cap.`;
    case 'capped':
      return `Use another card until this resets on ${formatResetDate(projection.resetsOn)}.`;
    case 'earning':
    case 'open':
      return formatDaysRemaining(projection.daysRemaining, projection.resetsOn);
  }
}

export function formatThresholdSummary(
  card: CreditCard,
  formatting: CardFormatting,
): string {
  const values = [
    card.featured === false ? 'Not on Overview' : 'On Overview',
    formatRate(card, formatting),
  ];
  if (typeof card.minimumSpend === 'number' && card.minimumSpend > 0) {
    values.push(`Min ${formatting.currencyCompact(card.minimumSpend)}`);
  } else {
    values.push('No minimum');
  }
  if (typeof card.maximumSpend === 'number' && card.maximumSpend > 0) {
    values.push(`Cap ${formatting.currencyCompact(card.maximumSpend)}`);
  } else {
    values.push('No cap');
  }
  if (typeof card.earningBlockSize === 'number' && card.earningBlockSize > 0) {
    values.push(`${formatting.currencyCompact(card.earningBlockSize)} blocks`);
  }
  return values.join(' · ');
}

export function isCardConfigured(card: CreditCard): boolean {
  if (typeof card.earningRate === 'number' && Number.isFinite(card.earningRate)) {
    return true;
  }
  return Boolean(
    card.subcategoriesEnabled &&
      card.subcategories?.some(
        (subcategory) =>
          subcategory.active !== false &&
          !subcategory.excludeFromRewards &&
          typeof subcategory.rewardValue === 'number' &&
          Number.isFinite(subcategory.rewardValue),
      ),
  );
}

export function flagColor(flag: string): ColorValue {
  switch (flag) {
    case 'red': return semanticColors.systemRed;
    case 'orange': return semanticColors.systemOrange;
    case 'yellow': return semanticColors.systemYellow;
    case 'green': return semanticColors.systemGreen;
    case 'blue': return semanticColors.systemBlue;
    case 'purple': return semanticColors.systemPurple;
    default: return semanticColors.systemGray;
  }
}
