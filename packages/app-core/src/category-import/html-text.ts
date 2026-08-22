export const CATEGORY_IMPORT_TEXT_LIMIT = 100_000;

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function htmlToPlainText(
  html: string,
  maxChars = CATEGORY_IMPORT_TEXT_LIMIT,
): { text: string; truncated: boolean } {
  const withoutBlocks = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');

  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? '';
  });

  const text = decoded.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars).trimEnd(), truncated: true };
}
