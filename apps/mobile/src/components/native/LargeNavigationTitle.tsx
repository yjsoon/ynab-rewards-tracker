import {
  Platform,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { LargeTitle } from '../ios/Typography';

export interface LargeNavigationTitleProps {
  children: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Visual equivalent of UINavigationBar's large title for the iOS 26 fallback.
 * The standard native title remains in use on iOS 18 and earlier.
 */
export function LargeNavigationTitle({
  children,
  style,
}: LargeNavigationTitleProps) {
  const isNeeded = Platform.OS === 'ios' && Number(Platform.Version) >= 26;
  if (!isNeeded) return null;

  return (
    <LargeTitle accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </LargeTitle>
  );
}

const styles = StyleSheet.create({
  title: {
    alignSelf: 'stretch',
    flexShrink: 1,
  },
});
