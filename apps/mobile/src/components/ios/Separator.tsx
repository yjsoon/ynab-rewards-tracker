import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { semanticColors } from '../../theme/semanticColors';

interface SeparatorProps {
  inset?: number;
  style?: ViewStyle;
}

/**
 * iOS-style separator (hairline divider)
 * Uses iOS separator color and proper hairline width
 */
export function Separator({ inset = 0, style }: SeparatorProps) {
  return (
    <View style={[styles.separator, { marginLeft: inset }, style]} />
  );
}

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.separator,
  },
});