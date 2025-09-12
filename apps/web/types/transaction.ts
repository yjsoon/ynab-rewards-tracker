export interface Transaction {
  id: string;
  date: string;
  amount: number;
  payee_name: string;
  category_name?: string;
  memo?: string;
  cleared: string;
  approved: boolean;
  account_id: string;
  flag_color?: string | null;
  flag_name?: string | null;
  subtransactions?: Transaction[];
}

export interface TransactionWithRewards extends Transaction {
  // Computed fields for rewards tracking
  eligibleAmount?: number;
  rewardCategory?: string;
  appliedRules?: AppliedRule[];
  rewardEarned?: number;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  rewardType: 'cashback' | 'miles';
  rewardValue: number;
  earnedAmount: number;
}