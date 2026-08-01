/**
 * @ynab-counter/ynab-client
 * Platform-agnostic YNAB API client with standardised error handling.
 */

// Main client
export { YnabClient } from './client';
export type { YnabClientOptions, ListOptions, TransactionFilterOptions } from './client';

// Error types and helpers
export {
  YnabApiError,
  createYnabError,
  isYnabApiError,
  classifyHttpStatus,
} from './errors';
export type { YnabApiErrorCode } from './errors';

// Request utilities (for advanced use cases)
export { requestJson, defaultBackoff, DEFAULT_BASE_URL } from './request';
export type { RequestOptions } from './request';

// DTO types
export type {
  YnabApiResponse,
  YnabPlanSummary,
  YnabBudgetSummary,
  YnabAccountSummary,
  YnabPayee,
  YnabTransactionSummary,
  YnabSubtransaction,
  YnabCategoryGroup,
  YnabCategory,
  YnabSaveTransactionsData,
  YnabTransactionFlagColor,
} from './types';
