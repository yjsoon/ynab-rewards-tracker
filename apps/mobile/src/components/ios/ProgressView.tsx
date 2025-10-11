import React from 'react';
import { View, StyleSheet, ViewStyle, AccessibilityValue, type ColorValue } from 'react-native';
import { semanticColors } from '../../theme/semanticColors';

interface ProgressViewProps {
  value: number; // 0-1 (percentage as decimal)
  tintColor?: ColorValue;
  trackTintColor?: ColorValue;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityValue?: AccessibilityValue;
}

/**
 * iOS-style progress view (UIProgressView equivalent)
 * Uses proper iOS progress bar dimensions and styling
 */
export function ProgressView({
  value,
  tintColor,
  trackTintColor,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
}: ProgressViewProps) {
  const clampedValue = Math.max(0, Math.min(1, value));
  
  return (
    <View
      style={[
        styles.track,
        trackTintColor && { backgroundColor: trackTintColor },
        style
      ]}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityValue={accessibilityValue}
    >
      <View
        style={[
          styles.progress,
          {
            width: `${clampedValue * 100}%`,
            backgroundColor: tintColor || semanticColors.systemBlue,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: semanticColors.systemGray5,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: 2,
  },
});