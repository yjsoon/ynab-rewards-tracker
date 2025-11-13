export type { StatementFormatterProvider } from '@ynab-counter/app-core/storage';

export interface StatementFormatterTransaction {
  date: string;
  payee: string;
  memo: string;
  outflow: string;
  inflow: string;
}
