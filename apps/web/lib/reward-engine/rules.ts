export type ID = string;
export type ISODate = string;
export type Money = number; // milliunits
export type FlagName = 'red'|'orange'|'yellow'|'green'|'blue'|'purple';

export type Rule = {
  id: string;
  name: string;
  scope?: {
    accounts?: ID[];
    categories?: ID[];      // YNAB category IDs
    payees?: ID[];          // YNAB payee IDs
    flags?: FlagName[];     // YNAB color flags
    memoTags?: string[];    // hashtags parsed from memo
  };
  window?: {
    start: ISODate;
    end?: ISODate;
    cadence?: 'monthly'|'quarterly'|'annual';
    timezone?: string;
  };
  reward: {
    kind: 'percent'|'miles'|'flat';
    rate: number;           // percent: 0.05, miles: 3 (per $), flat: cents
    currency?: 'USD'|'mi'|'pt';
  };
  caps?: {
    overall?: Money;                // eligible spend cap per window
    byCategory?: Record<ID, Money>;
    byMonth?: Money;
    byPayee?: Record<ID, Money>;
  };
  stacking?: 'max'|'sum'|'first';
  priority?: number;                // used for 'first'
  notes?: string;
}

export type AccrualLine = {
  ruleId: string;
  transactionId: string;
  splitId?: string;
  eligibleMilli: Money;
  rewardKind: 'percent'|'miles'|'flat';
  rewardAmountRaw: number; // milli or points
  appliedCapMilli: Money;
}

export function dollars(milli: Money) {
  return milli / 1000;
}

export function calcPercent(eligibleMilli: Money, rate: number): number {
  // returns reward in cents-equivalent milliunits for consistency
  const cents = Math.floor((eligibleMilli / 10) * rate); // (milli/1000)*rate dollars → *100 cents → milli= *1000; simplified placeholder
  return cents;
}

