import { describe, expect, it } from 'vitest';

import { CATEGORY_IMPORT_TEXT_LIMIT, htmlToPlainText } from './html-text';

describe('htmlToPlainText', () => {
  it('strips tags, scripts, and common entities', () => {
    const { text, truncated } = htmlToPlainText(
      '<html><script>secret()</script><p>Dining &amp; petrol</p><style>p{}</style></html>',
    );
    expect(text).toBe('Dining & petrol');
    expect(truncated).toBe(false);
  });

  it('caps extracted text', () => {
    const { text, truncated } = htmlToPlainText('word '.repeat(40), 20);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(20);
  });

  it('uses the shared import limit by default', () => {
    expect(CATEGORY_IMPORT_TEXT_LIMIT).toBe(100_000);
    const { truncated, text } = htmlToPlainText('x'.repeat(CATEGORY_IMPORT_TEXT_LIMIT + 1));
    expect(truncated).toBe(true);
    expect(text).toHaveLength(100_000);
  });

  it('drops an unclosed script at the end of a page', () => {
    const { text } = htmlToPlainText('<p>Dining</p><script>secret()');
    expect(text).toBe('Dining');
  });
});
