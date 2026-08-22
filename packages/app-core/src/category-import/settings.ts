import type { CategoryImportProvider, StatementFormatterSettings } from '../storage/types';

export function mergeCategoryImportCredentials(
  current: StatementFormatterSettings | undefined,
  update: {
    provider: CategoryImportProvider;
    model?: string;
    apiKey?: string;
  },
): StatementFormatterSettings {
  return {
    ...current,
    categoryImportProvider: update.provider,
    apiKeys: {
      ...current?.apiKeys,
      ...(update.apiKey !== undefined ? { [update.provider]: update.apiKey } : {}),
    },
    modelByProvider: {
      ...current?.modelByProvider,
      ...(update.model !== undefined ? { [update.provider]: update.model } : {}),
    },
  };
}
