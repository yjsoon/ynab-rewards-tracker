/**
 * YNAB API response types (DTOs)
 */

export interface YnabPlanSummary {
  id: string;
  name: string;
  last_modified_on: string;
  first_month?: string;
  last_month?: string;
  date_format?: { format: string };
  currency_format?: {
    iso_code: string;
    example_format: string;
    decimal_digits: number;
    decimal_separator: string;
    symbol_first: boolean;
    group_separator: string;
    currency_symbol: string;
    display_symbol: boolean;
  };
}

export type YnabBudgetSummary = YnabPlanSummary;

/** Colours accepted by YNAB when setting or clearing a transaction flag. */
export type YnabTransactionFlagColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | null;

export interface YnabAccountSummary {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
  cleared_balance?: number;
  uncleared_balance?: number;
  transfer_payee_id?: string;
  direct_import_linked?: boolean;
  direct_import_in_error?: boolean;
  deleted?: boolean;
}

export interface YnabPayee {
  id: string;
  name: string;
  transfer_account_id?: string | null;
  deleted?: boolean;
}

export interface YnabTransactionSummary {
  id: string;
  date: string;
  amount: number;
  account_id: string;
  account_name?: string;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  memo?: string | null;
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  approved?: boolean;
  flag_color?: YnabTransactionFlagColor;
  flag_name?: string | null;
  import_id?: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  deleted?: boolean;
  subtransactions?: YnabSubtransaction[];
}

export interface YnabSubtransaction {
  id: string;
  transaction_id: string;
  amount: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  deleted?: boolean;
}

export interface YnabCategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  internal?: boolean;
  deleted?: boolean;
  categories: YnabCategory[];
}

export interface YnabCategory {
  id: string;
  category_group_id: string;
  category_group_name?: string;
  name: string;
  hidden: boolean;
  internal?: boolean;
  original_category_group_id?: string | null;
  note?: string | null;
  budgeted?: number;
  activity?: number;
  balance?: number;
  goal_type?: string | null;
  goal_day?: number | null;
  goal_cadence?: number | null;
  goal_cadence_frequency?: number | null;
  goal_creation_month?: string | null;
  goal_target?: number | null;
  goal_target_month?: string | null;
  goal_percentage_complete?: number | null;
  goal_months_to_budget?: number | null;
  goal_under_funded?: number | null;
  goal_overall_funded?: number | null;
  goal_overall_left?: number | null;
  deleted?: boolean;
}

/**
 * YNAB API wrapper response shape
 */
export interface YnabApiResponse<T> {
  data: T;
}

/** Response data returned by YNAB's bulk transaction save endpoint. */
export interface YnabSaveTransactionsData {
  transaction_ids: string[];
  transaction?: YnabTransactionSummary;
  transactions?: YnabTransactionSummary[];
  duplicate_import_ids?: string[];
  server_knowledge: number;
}
