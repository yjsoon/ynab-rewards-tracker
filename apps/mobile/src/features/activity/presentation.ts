import type {
  TransactionProjection,
  TransactionProjectionStatus,
} from '@ynab-counter/app-core/rewards-engine';
import type { AppSettings } from '@ynab-counter/app-core/storage';
import {
  formatCurrency,
  normalizeCurrencyCode,
} from '@ynab-counter/app-core/utils/currency';

const LOCALE = 'en-GB';

export interface ActivityFormatting {
  currency: (value: number) => string;
  number: (value: number) => string;
}

export function createActivityFormatting(settings: AppSettings): ActivityFormatting {
  const currency = normalizeCurrencyCode(settings.currency);

  return {
    currency: (value) => formatCurrency(value, {
      locale: LOCALE,
      currency,
      decimals: 2,
    }),
    number: (value) => new Intl.NumberFormat(LOCALE, {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value),
  };
}

export function formatTransactionAmount(
  projection: TransactionProjection,
  formatting: ActivityFormatting,
): string {
  const amount = projection.status === 'incoming'
    ? projection.amount
    : -projection.amount;
  const formatted = formatting.currency(amount);

  return projection.status === 'incoming' && !formatted.startsWith('+')
    ? `+${formatted}`
    : formatted;
}

export function formatRewardShort(
  projection: TransactionProjection,
  formatting: ActivityFormatting,
): string {
  if (projection.status !== 'earning') {
    return getRewardStatusCopy(projection);
  }

  if (projection.reward.type === 'miles') {
    return `+${formatting.number(projection.reward.amount)} miles`;
  }

  return `+${formatting.currency(projection.reward.amount)}`;
}

export function formatRewardLong(
  projection: TransactionProjection,
  formatting: ActivityFormatting,
): string {
  if (projection.status !== 'earning') {
    return getRewardStatusCopy(projection);
  }

  if (projection.reward.type === 'miles') {
    return `${formatting.number(projection.reward.amount)} miles`;
  }

  return formatting.currency(projection.reward.amount);
}

export function formatRewardValueDetail(
  projection: TransactionProjection,
  formatting: ActivityFormatting,
): string | undefined {
  if (projection.status === 'earning' && projection.reward.type === 'miles') {
    return `Approximately ${formatting.currency(projection.reward.dollars)}`;
  }
  return undefined;
}

export function formatRewardRate(projection: TransactionProjection): string {
  if (!projection.card) {
    return 'Not applicable';
  }

  const value = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 2,
  }).format(projection.reward.rate);

  return projection.card.type === 'cashback'
    ? `${value}% cashback`
    : `${value} ${projection.reward.rate === 1 ? 'mile' : 'miles'} per dollar`;
}

export function getRewardStatusCopy(projection: TransactionProjection): string {
  switch (projection.status) {
    case 'earning':
      return 'Reward earned';
    case 'incoming':
      return 'Incoming · no reward';
    case 'no_card':
      return 'No tracked card';
    case 'no_reward':
      switch (projection.noRewardReason) {
        case 'excluded':
          return 'Excluded · no reward';
        case 'below_block':
          return 'Below block · no reward';
        case 'zero_rate':
          return 'No earning rate';
        case 'zero_amount':
        case null:
          return 'No reward';
      }
  }
}

export function getRewardExplanation(
  projection: TransactionProjection,
  formatting: ActivityFormatting,
): string {
  switch (projection.status) {
    case 'earning':
      if (projection.blockInfo) {
        return `${projection.blockInfo.count} ${projection.blockInfo.count === 1 ? 'block' : 'blocks'} of ${formatting.currency(projection.blockInfo.size)} earned rewards.`;
      }
      return 'This transaction earns at the card’s configured rate.';
    case 'incoming':
      return 'Incoming funds do not earn card rewards.';
    case 'no_card':
      return 'This account is not linked to a tracked reward card.';
    case 'no_reward':
      switch (projection.noRewardReason) {
        case 'excluded':
          return 'The matching card category is excluded from rewards.';
        case 'below_block':
          return projection.blockInfo
            ? `The amount is below the ${formatting.currency(projection.blockInfo.size)} earning block.`
            : 'The amount is below the card’s earning block.';
        case 'zero_rate':
          return 'No earning rate is configured for this transaction.';
        case 'zero_amount':
        case null:
          return 'This transaction has no estimated reward.';
      }
  }
}

export function rewardStatusTone(
  status: TransactionProjectionStatus,
): 'positive' | 'attention' | 'neutral' {
  if (status === 'earning') {
    return 'positive';
  }
  if (status === 'no_reward') {
    return 'attention';
  }
  return 'neutral';
}

export function formatActivityDate(dateValue: string): string {
  const date = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatClearedState(value: string | null | undefined): string {
  if (!value) {
    return 'Not cleared';
  }
  return value.charAt(0).toLocaleUpperCase(LOCALE) + value.slice(1);
}

export function formatFlagName(
  flagName: string | null | undefined,
  flagColor: string | null | undefined,
): string | undefined {
  if (flagName?.trim()) {
    return flagName.trim();
  }
  if (!flagColor) {
    return undefined;
  }
  return `${flagColor.charAt(0).toLocaleUpperCase(LOCALE)}${flagColor.slice(1)} flag`;
}

export function flagColorValue(flagColor: string | null | undefined): string {
  switch (flagColor) {
    case 'red': return '#FF453A';
    case 'orange': return '#FF9F0A';
    case 'yellow': return '#FFD60A';
    case 'green': return '#30D158';
    case 'blue': return '#0A84FF';
    case 'purple': return '#BF5AF2';
    default: return '#8E8E93';
  }
}
