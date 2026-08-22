import type { CategoryImportCredentials, CategoryImportDeps, CategoryImportRequest, CategoryImportResult } from './types';
import { compileCategoryImport } from './compile';
import { htmlToPlainText } from './html-text';
import { parseCategoryImportResponse } from './parse';
import { buildCategoryImportPrompt, existingNamesFrom } from './prompt';

export async function proposeCardCategories(
  request: CategoryImportRequest,
  credentials: CategoryImportCredentials,
  deps: CategoryImportDeps,
): Promise<CategoryImportResult> {
  let termsText: string | undefined;
  const url = request.source.kind === 'instructions' ? undefined : request.source.url;
  const instructions = request.source.kind === 'termsUrl' ? undefined : request.source.instructions;

  if (url) {
    try {
      const fetched = await deps.fetchText(url);
      const { text, truncated } = htmlToPlainText(fetched);
      if (!text) {
        return { kind: 'fetch_failed', message: 'Could not read those terms.' };
      }
      termsText = text;
      if (truncated) {
        termsText = `${text}\n\n[Terms were truncated.]`;
      }
    } catch {
      return { kind: 'fetch_failed', message: 'Could not read those terms.' };
    }
  }

  const prompt = buildCategoryImportPrompt({
    cardType: request.cardType,
    instructions,
    termsText,
    existingNames: existingNamesFrom(request.existingSubcategories),
  });

  let raw: string;
  try {
    raw = await deps.completeChat({
      provider: credentials.provider,
      apiKey: credentials.apiKey,
      model: credentials.model,
      system: prompt.system,
      user: prompt.user,
    });
  } catch {
    return { kind: 'provider_failed', message: 'The model request failed. Check the API key and try again.' };
  }

  const parsed = parseCategoryImportResponse(raw, request.cardType);
  if (parsed.kind !== 'ok') {
    return parsed;
  }

  return {
    kind: 'ok',
    proposal: compileCategoryImport({
      parsed: parsed.parsed,
      cardType: request.cardType,
      earningRate: request.earningRate,
      existingSubcategories: request.existingSubcategories,
    }),
  };
}
