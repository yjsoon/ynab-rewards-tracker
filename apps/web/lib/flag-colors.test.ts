import { describe, expect, it } from 'vitest';

import {
  getFlagHex,
  getFlagClasses,
  getFlagBorderColor,
} from './flag-colors';

describe('getFlagHex', () => {
  it('returns correct hex codes for all YNAB flag colors', () => {
    expect(getFlagHex('red')).toBe('#ef4444');
    expect(getFlagHex('orange')).toBe('#f97316');
    expect(getFlagHex('yellow')).toBe('#eab308');
    expect(getFlagHex('green')).toBe('#22c55e');
    expect(getFlagHex('blue')).toBe('#3b82f6');
    expect(getFlagHex('purple')).toBe('#a855f7');
    expect(getFlagHex('unflagged')).toBe('#6b7280');
  });

  it('handles case-insensitive input', () => {
    expect(getFlagHex('RED')).toBe('#ef4444');
    expect(getFlagHex('Red')).toBe('#ef4444');
    expect(getFlagHex('rEd')).toBe('#ef4444');
    expect(getFlagHex('ORANGE')).toBe('#f97316');
    expect(getFlagHex('Blue')).toBe('#3b82f6');
  });

  it('returns unflagged color for null input', () => {
    expect(getFlagHex(null)).toBe('#6b7280');
  });

  it('returns unflagged color for undefined input', () => {
    expect(getFlagHex(undefined)).toBe('#6b7280');
  });

  it('returns unflagged color for empty string', () => {
    expect(getFlagHex('')).toBe('#6b7280');
  });

  it('falls back to unflagged color for invalid flag colors', () => {
    expect(getFlagHex('invalid')).toBe('#6b7280');
    expect(getFlagHex('pink')).toBe('#6b7280');
    expect(getFlagHex('black')).toBe('#6b7280');
    expect(getFlagHex('white')).toBe('#6b7280');
  });

  it('returns valid hex color format', () => {
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'unflagged'];
    colors.forEach(color => {
      const hex = getFlagHex(color);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});

describe('getFlagClasses', () => {
  it('returns correct Tailwind classes for all flag colors', () => {
    const redClasses = getFlagClasses('red');
    expect(redClasses.bg).toBe('bg-transparent');
    expect(redClasses.border).toBe('border-border');
    expect(redClasses.text).toBe('text-red-700 dark:text-red-300');
    expect(redClasses.dot).toBe('bg-red-500');

    const blueClasses = getFlagClasses('blue');
    expect(blueClasses.text).toBe('text-blue-700 dark:text-blue-200');
    expect(blueClasses.dot).toBe('bg-blue-500');

    const purpleClasses = getFlagClasses('purple');
    expect(purpleClasses.text).toBe('text-purple-700 dark:text-purple-200');
    expect(purpleClasses.dot).toBe('bg-purple-500');
  });

  it('returns unflagged classes for all colors', () => {
    const unflaggedClasses = getFlagClasses('unflagged');
    expect(unflaggedClasses.bg).toBe('bg-transparent');
    expect(unflaggedClasses.border).toBe('border-border');
    expect(unflaggedClasses.text).toBe('text-gray-700 dark:text-slate-300');
    expect(unflaggedClasses.dot).toBe('bg-gray-500');
  });

  it('handles case-insensitive input', () => {
    const lower = getFlagClasses('green');
    const upper = getFlagClasses('GREEN');
    const mixed = getFlagClasses('GrEeN');

    expect(lower).toEqual(upper);
    expect(lower).toEqual(mixed);
  });

  it('returns unflagged classes for null input', () => {
    const classes = getFlagClasses(null);
    expect(classes.text).toBe('text-gray-700 dark:text-slate-300');
  });

  it('returns unflagged classes for undefined input', () => {
    const classes = getFlagClasses(undefined);
    expect(classes.text).toBe('text-gray-700 dark:text-slate-300');
  });

  it('returns unflagged classes for empty string', () => {
    const classes = getFlagClasses('');
    expect(classes.text).toBe('text-gray-700 dark:text-slate-300');
  });

  it('falls back to unflagged classes for invalid colors', () => {
    const invalid = getFlagClasses('invalid');
    const unflagged = getFlagClasses('unflagged');
    expect(invalid).toEqual(unflagged);
  });

  it('returns objects with all required properties', () => {
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'unflagged'];
    colors.forEach(color => {
      const classes = getFlagClasses(color);
      expect(classes).toHaveProperty('bg');
      expect(classes).toHaveProperty('border');
      expect(classes).toHaveProperty('text');
      expect(classes).toHaveProperty('dot');
      expect(typeof classes.bg).toBe('string');
      expect(typeof classes.border).toBe('string');
      expect(typeof classes.text).toBe('string');
      expect(typeof classes.dot).toBe('string');
    });
  });

  it('all backgrounds are transparent', () => {
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'unflagged'];
    colors.forEach(color => {
      const classes = getFlagClasses(color);
      expect(classes.bg).toBe('bg-transparent');
    });
  });

  it('all borders use border-border class', () => {
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'unflagged'];
    colors.forEach(color => {
      const classes = getFlagClasses(color);
      expect(classes.border).toBe('border-border');
    });
  });
});

describe('getFlagBorderColor', () => {
  it('returns rgba format with default alpha', () => {
    const result = getFlagBorderColor('red');
    expect(result).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/);
  });

  it('uses default alpha of 0.45', () => {
    const result = getFlagBorderColor('red');
    expect(result).toContain('0.45');
  });

  it('accepts custom alpha values', () => {
    expect(getFlagBorderColor('red', 0.5)).toContain('0.5');
    expect(getFlagBorderColor('blue', 0.3)).toContain('0.3');
    expect(getFlagBorderColor('green', 1.0)).toContain('1');
    expect(getFlagBorderColor('yellow', 0)).toContain('0');
  });

  it('converts red hex correctly', () => {
    // #ef4444 = rgb(239, 68, 68)
    const result = getFlagBorderColor('red', 0.4);
    expect(result).toBe('rgba(239, 68, 68, 0.4)');
  });

  it('converts orange hex correctly', () => {
    // #f97316 = rgb(249, 115, 22)
    const result = getFlagBorderColor('orange', 0.4);
    expect(result).toBe('rgba(249, 115, 22, 0.4)');
  });

  it('converts yellow hex correctly', () => {
    // #eab308 = rgb(234, 179, 8)
    const result = getFlagBorderColor('yellow', 0.4);
    expect(result).toBe('rgba(234, 179, 8, 0.4)');
  });

  it('converts green hex correctly', () => {
    // #22c55e = rgb(34, 197, 94)
    const result = getFlagBorderColor('green', 0.4);
    expect(result).toBe('rgba(34, 197, 94, 0.4)');
  });

  it('converts blue hex correctly', () => {
    // #3b82f6 = rgb(59, 130, 246)
    const result = getFlagBorderColor('blue', 0.4);
    expect(result).toBe('rgba(59, 130, 246, 0.4)');
  });

  it('converts purple hex correctly', () => {
    // #a855f7 = rgb(168, 85, 247)
    const result = getFlagBorderColor('purple', 0.4);
    expect(result).toBe('rgba(168, 85, 247, 0.4)');
  });

  it('converts unflagged hex correctly', () => {
    // #6b7280 = rgb(107, 114, 128)
    const result = getFlagBorderColor('unflagged', 0.4);
    expect(result).toBe('rgba(107, 114, 128, 0.4)');
  });

  it('handles null input with default unflagged color', () => {
    const result = getFlagBorderColor(null, 0.4);
    expect(result).toBe('rgba(107, 114, 128, 0.4)');
  });

  it('handles undefined input with default unflagged color', () => {
    const result = getFlagBorderColor(undefined, 0.4);
    expect(result).toBe('rgba(107, 114, 128, 0.4)');
  });

  it('handles case-insensitive color names', () => {
    const lower = getFlagBorderColor('red', 0.5);
    const upper = getFlagBorderColor('RED', 0.5);
    const mixed = getFlagBorderColor('ReD', 0.5);

    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  it('falls back to unflagged for invalid colors', () => {
    const invalid = getFlagBorderColor('invalid', 0.4);
    const unflagged = getFlagBorderColor('unflagged', 0.4);
    expect(invalid).toBe(unflagged);
  });

  it('handles edge case alpha values', () => {
    expect(getFlagBorderColor('red', 0)).toContain('0');
    expect(getFlagBorderColor('red', 1)).toContain('1');
    expect(getFlagBorderColor('red', 0.99)).toContain('0.99');
    expect(getFlagBorderColor('red', 0.01)).toContain('0.01');
  });

  it('preserves alpha decimal precision', () => {
    expect(getFlagBorderColor('blue', 0.123)).toContain('0.123');
    expect(getFlagBorderColor('green', 0.456789)).toContain('0.456789');
  });
});

describe('hexToRgb (internal function via getFlagBorderColor)', () => {
  it('handles 6-character hex colors', () => {
    // Testing via getFlagBorderColor since hexToRgb is not exported
    // #ffffff = rgb(255, 255, 255) - but we don't have white in the palette
    // Using existing colors to verify the conversion works
    const red = getFlagBorderColor('red', 1);
    expect(red).toBe('rgba(239, 68, 68, 1)');
  });

  it('produces valid RGB values (0-255 range)', () => {
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'unflagged'];
    colors.forEach(color => {
      const rgba = getFlagBorderColor(color, 1);
      const match = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
      expect(match).not.toBeNull();

      if (match) {
        const [, r, g, b] = match;
        const rNum = parseInt(r, 10);
        const gNum = parseInt(g, 10);
        const bNum = parseInt(b, 10);

        expect(rNum).toBeGreaterThanOrEqual(0);
        expect(rNum).toBeLessThanOrEqual(255);
        expect(gNum).toBeGreaterThanOrEqual(0);
        expect(gNum).toBeLessThanOrEqual(255);
        expect(bNum).toBeGreaterThanOrEqual(0);
        expect(bNum).toBeLessThanOrEqual(255);
      }
    });
  });
});
