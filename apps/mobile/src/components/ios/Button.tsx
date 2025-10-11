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

  // Get container styles safely
  const getContainerStyle = (v: ButtonVariant) => {
    switch (v) {
      case 'filled': return styles.filledContainer;
      case 'tinted': return styles.tintedContainer;
      case 'plain': return styles.plainContainer;
    }
  };

  const getPressedStyle = (v: ButtonVariant) => {
    switch (v) {
      case 'filled': return styles.filledPressed;
      case 'tinted': return styles.tintedPressed;
      case 'plain': return styles.plainPressed;
    }
  };

  const getSizeContainerStyle = (s: ButtonSize) => {
    switch (s) {
      case 'small': return styles.smallContainer;
      case 'medium': return styles.mediumContainer;
      case 'large': return styles.largeContainer;
    }
  };

  const getTextStyle = (v: ButtonVariant) => {
    switch (v) {
      case 'filled': return styles.filledText;
      case 'tinted': return styles.tintedText;
      case 'plain': return styles.plainText;
    }
  };

  const getSizeTextStyle = (s: ButtonSize) => {
    switch (s) {
      case 'small': return styles.smallText;
      case 'medium': return styles.mediumText;
      case 'large': return styles.largeText;
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        getContainerStyle(variant),
        getSizeContainerStyle(size),
        pressed && getPressedStyle(variant),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.baseText,
          getTextStyle(variant),
          getSizeTextStyle(size),
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
    backgroundColor: '#007AFF26', // systemBlue at 15% opacity
  },
  tintedPressed: {
    backgroundColor: '#007AFF40', // systemBlue at 25% opacity
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