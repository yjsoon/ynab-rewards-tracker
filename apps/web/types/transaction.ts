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
  rewardEarned?: number;
}
