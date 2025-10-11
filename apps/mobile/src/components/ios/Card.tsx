import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { semanticColors } from '../../theme/semanticColors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * iOS-style grouped list card
 * Matches the design of iOS Settings app sections
 */
export function Card({ children, style }: CardProps) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    borderRadius: 10,
    overflow: 'hidden',
  },
});