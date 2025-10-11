import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Caption1 } from './Typography';
import { semanticColors } from '../../theme/semanticColors';

interface SectionHeaderProps {
  children: string;
  style?: ViewStyle;
}

/**
 * iOS-style section header for grouped lists
 * Matches iOS Settings app section headers
 */
export function SectionHeader({ children, style }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Caption1 color="secondary" style={styles.text}>
        {children.toUpperCase()}
      </Caption1>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  text: {
    letterSpacing: 0.5,
  },
});