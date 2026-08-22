import type { CategoryImportProvider } from '../storage/types';

export interface CategoryImportProviderInfo {
  id: CategoryImportProvider;
  label: string;
  docsUrl: string;
  docsLabel: string;
  placeholder: string;
  chatCompletionsUrl: string;
  defaultModel: string;
  models: ReadonlyArray<{ value: string; label: string }>;
}

export const CATEGORY_IMPORT_PROVIDERS: readonly CategoryImportProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI',
    placeholder: 'sk-...',
    chatCompletionsUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    docsUrl: 'https://openrouter.ai/keys',
    docsLabel: 'OpenRouter',
    placeholder: 'sk-or-...',
    chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
      { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (Anthropic)' },
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    docsUrl: 'https://opencode.ai/auth',
    docsLabel: 'OpenCode Zen',
    placeholder: 'zen-...',
    chatCompletionsUrl: 'https://opencode.ai/zen/v1/chat/completions',
    defaultModel: 'minimax-m2.7',
    models: [
      { value: 'minimax-m2.7', label: 'MiniMax M2.7' },
      { value: 'glm-5.1', label: 'GLM 5.1' },
      { value: 'kimi-k2.6', label: 'Kimi K2.6' },
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    ],
  },
] as const;

const PROVIDER_BY_ID = new Map(
  CATEGORY_IMPORT_PROVIDERS.map((provider) => [provider.id, provider]),
);

export function getCategoryImportProvider(
  id: CategoryImportProvider,
): CategoryImportProviderInfo {
  const provider = PROVIDER_BY_ID.get(id);
  if (!provider) {
    throw new Error(`Unknown category-import provider: ${id}`);
  }
  return provider;
}

export function defaultModelFor(provider: CategoryImportProvider): string {
  return getCategoryImportProvider(provider).defaultModel;
}
