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
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*$/gi, ' ');

  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return decodeCodePoint(entity.slice(2), 16);
    }
    if (entity.startsWith('#')) {
      return decodeCodePoint(entity.slice(1), 10);
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? `&${entity};`;
  });

  const text = decoded.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars).trimEnd(), truncated: true };
}

function decodeCodePoint(value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return '';
  }
  return String.fromCodePoint(codePoint);
}
