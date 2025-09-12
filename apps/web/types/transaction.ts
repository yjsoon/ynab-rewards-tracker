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
  subtransactions?: Transaction[];
}