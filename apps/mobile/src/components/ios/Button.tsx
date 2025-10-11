import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useHaptics } from '../../hooks/useHaptics';
import { semanticColors } from '../../theme/semanticColors';

type ButtonVariant = 'filled' | 'tinted' | 'plain';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  children: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * iOS-style button following UIButton design
 * Supports filled, tinted, and plain variants
 */
export function Button({
  children,
  onPress,
  variant = 'filled',
  size = 'medium',
  disabled = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const { impact } = useHaptics();

  const handlePress = () => {
    impact('medium');
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        styles[`${variant}Container`],
        styles[`${size}Container`],
        pressed && styles[`${variant}Pressed`],
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.baseText,
          styles[`${variant}Text`],
          styles[`${size}Text`],
          disabled && styles.disabledText,
          textStyle,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  
  // Variants
  filledContainer: {
    backgroundColor: semanticColors.systemBlue,
  },
  filledPressed: {
    opacity: 0.8,
  },
  filledText: {
    color: semanticColors.primaryButtonForeground,
    fontWeight: '600',
  },
  
  tintedContainer: {
    backgroundColor: semanticColors.systemBlue,
    opacity: 0.15,
  },
  tintedPressed: {
    opacity: 0.25,
  },
  tintedText: {
    color: semanticColors.systemBlue,
    fontWeight: '600',
  },
  
  plainContainer: {
    backgroundColor: 'transparent',
  },
  plainPressed: {
    opacity: 0.6,
  },
  plainText: {
    color: semanticColors.systemBlue,
    fontWeight: '400',
  },
  
  // Sizes
  smallContainer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 28,
  },
  smallText: {
    fontSize: 13,
  },
  
  mediumContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  mediumText: {
    fontSize: 17,
  },
  
  largeContainer: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 50,
  },
  largeText: {
    fontSize: 20,
  },
  
  // States
  disabled: {
    opacity: 0.3,
  },
  disabledText: {
    opacity: 1,
  },
  
  baseText: {
    textAlign: 'center',
  },
});