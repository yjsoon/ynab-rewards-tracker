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
    defaultModel: 'gpt-5.6-luna',
    models: [
      { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna Max' },
      { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    docsUrl: 'https://openrouter.ai/keys',
    docsLabel: 'OpenRouter',
    placeholder: 'sk-or-...',
    chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-5.6-luna',
    models: [
      { value: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna Max (OpenAI)' },
      { value: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol (OpenAI)' },
      { value: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5 (Anthropic)' },
      { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 (Anthropic)' },
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    docsUrl: 'https://opencode.ai/auth',
    docsLabel: 'OpenCode Zen',
    placeholder: 'zen-...',
    chatCompletionsUrl: 'https://opencode.ai/zen/v1/chat/completions',
    defaultModel: 'minimax-m3',
    models: [
      { value: 'minimax-m3', label: 'MiniMax M3' },
      { value: 'glm-5.2', label: 'GLM 5.2' },
      { value: 'kimi-k3', label: 'Kimi K3' },
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
