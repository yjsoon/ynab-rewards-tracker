import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Platform } from 'react-native';

import { semanticColors, semanticHex } from './semanticColors';

/**
 * Expo SDK 54 bundles react-native-screens 4.16, whose native large-title label
 * is present to accessibility but renders transparent on iOS 26. Keep the
 * real collapsing title everywhere else and use an in-scroll SF title there.
 */
export const usesIOS26LargeTitleFallback = (
  Platform.OS === 'ios' && Number(Platform.Version) >= 26
);

/**
 * Shared native stack chrome. Screen layouts choose whether a destination uses
 * a large or inline title; the bar itself stays system-managed so iOS can apply
 * the correct scroll-edge material for each OS version.
 */
export function nativeStackScreenOptions(isDark: boolean): NativeStackNavigationOptions {
  const headerLabel = isDark ? '#F5F5F7' : '#111114';

  return {
    contentStyle: { backgroundColor: semanticColors.systemGroupedBackground },
    headerBackButtonDisplayMode: 'minimal',
    headerLargeStyle: { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
    headerLargeTitleShadowVisible: false,
    headerLargeTitleStyle: { color: headerLabel },
    headerStyle: { backgroundColor: isDark ? '#000000' : '#FFFFFF' },
    headerTintColor: isDark ? semanticHex.actionDark : semanticHex.action,
    headerTitleStyle: { color: headerLabel },
  };
}
