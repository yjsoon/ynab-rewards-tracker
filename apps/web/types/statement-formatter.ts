export type StatementFormatterProvider = 'openai' | 'gemini' | 'openrouter';

export interface StatementFormatterTransaction {
  date: string;
  payee: string;
  memo: string;
  outflow: string;
  inflow: string;
}
