import { DynamicColorIOS, Platform, PlatformColor, type ColorValue } from 'react-native';

/** Fixed master colours from design/brand. */
export const brandPalette = {
  crimson: '#D92D2D',
  ember: '#FF6A45',
  charcoal: '#1D1B20',
  spark: '#F5B942',
  white: '#FFFFFF',
} as const;

/**
 * Helper to create explicit light/dark color pairs for iOS
 * Falls back to light color on Android
 */
export function dynamicColor(
  lightColor: string,
  darkColor: string,
  highContrastLight = lightColor,
  highContrastDark = darkColor,
): ColorValue {
  if (Platform.OS === 'ios' && Number(Platform.Version) >= 13) {
    return DynamicColorIOS({
      light: lightColor,
      dark: darkColor,
      highContrastLight,
      highContrastDark,
    });
  }
  return lightColor;
}

function platformColor(name: string, fallback: string): ColorValue {
  return Platform.OS === 'ios' ? PlatformColor(name) : fallback;
}

/**
 * Night Terminal Spark brand colours. These are deliberately separate from
 * system status colours: crimson/coral signal brand action, gold belongs only
 * to the spark, and system red remains available for capped/destructive state.
 */
export const brandColors = {
  action: dynamicColor(brandPalette.crimson, '#FF5B57', '#C91F28', '#FF6964'),
  actionPressed: dynamicColor('#B82229', '#E84743', '#A81820', '#F0524D'),
  actionTint: dynamicColor('#FBEAEA', '#3A1A1C', '#F8DFDF', '#492022'),
  coral: dynamicColor(brandPalette.ember, '#FF7857', '#EC5535', '#FF866A'),
  spark: dynamicColor(brandPalette.spark, '#FFCE58', '#A86200', '#FFDA76'),
  charcoal: dynamicColor(brandPalette.charcoal, '#26232B', '#111014', '#302D35'),
  progressTrack: dynamicColor('#E8E8ED', '#2C2C2E', '#D8D8DE', '#3A3A3C'),
} as const;

/**
 * iOS semantic color system using PlatformColor for automatic theme support
 * Includes fallbacks for Android and older iOS versions
 */
export const semanticColors = {
  // Labels (text hierarchy)
  label: platformColor('label', '#111114'),
  secondaryLabel: platformColor('secondaryLabel', '#636366'),
  tertiaryLabel: platformColor('tertiaryLabel', '#8E8E93'),
  quaternaryLabel: platformColor('quaternaryLabel', '#AEAEB2'),

  // Backgrounds
  systemBackground: platformColor('systemBackground', '#FFFFFF'),
  secondarySystemBackground: platformColor('secondarySystemBackground', '#F2F2F7'),
  tertiarySystemBackground: platformColor('tertiarySystemBackground', '#FFFFFF'),
  systemGroupedBackground: platformColor('systemGroupedBackground', '#F2F2F7'),
  secondarySystemGroupedBackground: platformColor('secondarySystemGroupedBackground', '#FFFFFF'),

  // Fills
  systemFill: platformColor('systemFill', '#78788033'),
  secondarySystemFill: platformColor('secondarySystemFill', '#78788028'),
  tertiarySystemFill: platformColor('tertiarySystemFill', '#7676801E'),
  quaternarySystemFill: platformColor('quaternarySystemFill', '#74748014'),

  // Separators
  separator: platformColor('separator', '#C6C6C8'),
  opaqueSeparator: platformColor('opaqueSeparator', '#C6C6C8'),

  // System accent colors
  systemBlue: platformColor('systemBlue', '#007AFF'),
  systemGreen: platformColor('systemGreen', '#248A3D'),
  systemIndigo: platformColor('systemIndigo', '#5856D6'),
  systemOrange: platformColor('systemOrange', '#FF9500'),
  systemPink: platformColor('systemPink', '#FF2D55'),
  systemPurple: platformColor('systemPurple', '#AF52DE'),
  systemRed: platformColor('systemRed', '#D70015'),
  systemTeal: platformColor('systemTeal', '#008299'),
  systemYellow: platformColor('systemYellow', '#FFCC00'),

  // System grays
  systemGray: platformColor('systemGray', '#8E8E93'),
  systemGray2: platformColor('systemGray2', '#AEAEB2'),
  systemGray3: platformColor('systemGray3', '#C7C7CC'),
  systemGray4: platformColor('systemGray4', '#D1D1D6'),
  systemGray5: platformColor('systemGray5', '#E5E5EA'),
  systemGray6: platformColor('systemGray6', '#F2F2F7'),

  // App semantics
  action: brandColors.action,
  actionPressed: brandColors.actionPressed,
  actionTint: brandColors.actionTint,
  spark: brandColors.spark,
  positive: dynamicColor('#237A37', '#30D158', '#17662A', '#4ADE68'),
  positiveTint: dynamicColor('#E8F7EC', '#142E1B', '#DCF3E2', '#193821'),
  attention: dynamicColor('#A43D00', '#FF9F0A', '#833000', '#FFB340'),
  attentionTint: dynamicColor('#FFF1E6', '#382313', '#FCE7D7', '#472B16'),
  destructive: platformColor('systemRed', '#D70015'),
  destructiveTint: dynamicColor('#FDE9E8', '#3B1718', '#FADDDC', '#4A1B1C'),
  capped: platformColor('systemRed', '#D70015'),
  neutralTint: platformColor('secondarySystemFill', '#78788028'),
  progressTrack: brandColors.progressTrack,

  // Custom tokens for specific use cases
  // Button text that stays white in both light and dark modes for contrast
  primaryButtonForeground: dynamicColor('#FFFFFF', '#FFFFFF'),
} as const;

// Hex string equivalents for places that require string colors (e.g. react-native-svg icons)
export const semanticHex = {
  action: brandPalette.crimson,
  actionDark: '#FF5B57',
  coral: brandPalette.ember,
  spark: brandPalette.spark,
  attention: '#A43D00',
  attentionDark: '#FF9F0A',
  systemBlue: '#007AFF',
  systemPurple: '#AF52DE',
  systemOrange: '#FF9500',
  systemGreen: '#34C759',
  systemRed: '#FF3B30',
  systemGray2: '#AEAEB2',
  systemGray3: '#C7C7CC',
} as const;

// Append an alpha channel to a #RRGGBB color (returns #RRGGBBAA)
export function withAlpha(hex: string, alpha: string): string {
  if (!hex || hex[0] !== '#') return hex;
  if (hex.length === 7) return `${hex}${alpha}`; // #RRGGBB
  if (hex.length === 9) return `${hex.slice(0, 7)}${alpha}`; // #RRGGBBAA -> replace
  if (hex.length === 4) {
    // #RGB -> #RRGGBB then add alpha
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}${alpha}`;
  }
  return `${hex}${alpha}`;
}
