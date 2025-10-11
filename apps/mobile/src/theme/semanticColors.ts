import { PlatformColor, Platform, DynamicColorIOS } from 'react-native';

/**
 * Helper to create explicit light/dark color pairs for iOS
 * Falls back to light color on Android
 */
function dynamicColor(lightColor: string, darkColor: string) {
  if (Platform.OS === 'ios' && Platform.Version >= 13) {
    return DynamicColorIOS({ light: lightColor, dark: darkColor });
  }
  return lightColor;
}

/**
 * iOS semantic color system using PlatformColor for automatic theme support
 * Includes fallbacks for Android and older iOS versions
 */
export const semanticColors = {
  // Labels (text hierarchy)
  label: Platform.OS === 'ios' ? PlatformColor('label') : '#000000',
  secondaryLabel: Platform.OS === 'ios' ? PlatformColor('secondaryLabel') : '#3C3C43',
  tertiaryLabel: Platform.OS === 'ios' ? PlatformColor('tertiaryLabel') : '#3C3C4399',
  quaternaryLabel: Platform.OS === 'ios' ? PlatformColor('quaternaryLabel') : '#3C3C4330',
  
  // Backgrounds
  systemBackground: Platform.OS === 'ios' ? PlatformColor('systemBackground') : '#FFFFFF',
  secondarySystemBackground: Platform.OS === 'ios' ? PlatformColor('secondarySystemBackground') : '#F2F2F7',
  tertiarySystemBackground: Platform.OS === 'ios' ? PlatformColor('tertiarySystemBackground') : '#FFFFFF',
  systemGroupedBackground: Platform.OS === 'ios' ? PlatformColor('systemGroupedBackground') : '#F2F2F7',
  secondarySystemGroupedBackground: Platform.OS === 'ios' ? PlatformColor('secondarySystemGroupedBackground') : '#FFFFFF',
  
  // Fills
  systemFill: Platform.OS === 'ios' ? PlatformColor('systemFill') : '#78788033',
  secondarySystemFill: Platform.OS === 'ios' ? PlatformColor('secondarySystemFill') : '#78788028',
  tertiarySystemFill: Platform.OS === 'ios' ? PlatformColor('tertiarySystemFill') : '#7676801E',
  quaternarySystemFill: Platform.OS === 'ios' ? PlatformColor('quaternarySystemFill') : '#74748014',
  
  // Separators
  separator: Platform.OS === 'ios' ? PlatformColor('separator') : '#C6C6C8',
  opaqueSeparator: Platform.OS === 'ios' ? PlatformColor('opaqueSeparator') : '#C6C6C8',
  
  // System accent colors
  systemBlue: Platform.OS === 'ios' ? PlatformColor('systemBlue') : '#007AFF',
  systemGreen: Platform.OS === 'ios' ? PlatformColor('systemGreen') : '#34C759',
  systemIndigo: Platform.OS === 'ios' ? PlatformColor('systemIndigo') : '#5856D6',
  systemOrange: Platform.OS === 'ios' ? PlatformColor('systemOrange') : '#FF9500',
  systemPink: Platform.OS === 'ios' ? PlatformColor('systemPink') : '#FF2D55',
  systemPurple: Platform.OS === 'ios' ? PlatformColor('systemPurple') : '#AF52DE',
  systemRed: Platform.OS === 'ios' ? PlatformColor('systemRed') : '#FF3B30',
  systemTeal: Platform.OS === 'ios' ? PlatformColor('systemTeal') : '#5AC8FA',
  systemYellow: Platform.OS === 'ios' ? PlatformColor('systemYellow') : '#FFCC00',
  
  // System grays
  systemGray: Platform.OS === 'ios' ? PlatformColor('systemGray') : '#8E8E93',
  systemGray2: Platform.OS === 'ios' ? PlatformColor('systemGray2') : '#AEAEB2',
  systemGray3: Platform.OS === 'ios' ? PlatformColor('systemGray3') : '#C7C7CC',
  systemGray4: Platform.OS === 'ios' ? PlatformColor('systemGray4') : '#D1D1D6',
  systemGray5: Platform.OS === 'ios' ? PlatformColor('systemGray5') : '#E5E5EA',
  systemGray6: Platform.OS === 'ios' ? PlatformColor('systemGray6') : '#F2F2F7',
  
  // Custom tokens for specific use cases
  // Button text that stays white in both light and dark modes for contrast
  primaryButtonForeground: dynamicColor('#FFFFFF', '#FFFFFF'),
};