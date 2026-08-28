import React, { type ReactNode } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import type { AccessibilityState, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useHaptics } from '../../hooks/useHaptics';
import { semanticColors } from '../../theme/semanticColors';
import { interaction, nativeMetrics } from '../../theme/tokens';

type ButtonVariant = 'filled' | 'tinted' | 'plain';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
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
  accessibilityState,
  testID,
}: ButtonProps) {
  const { impact } = useHaptics();

  const handlePress = () => {
    impact(size === 'large' ? 'medium' : 'light');
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
      accessibilityState={{ ...accessibilityState, disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        getContainerStyle(variant),
        getSizeContainerStyle(size),
        pressed && getPressedStyle(variant),
        disabled && styles.disabled,
        style,
      ]}
    >
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text
          style={[
            styles.baseText,
            getTextStyle(variant),
            getSizeTextStyle(size),
            disabled && styles.disabledText,
            textStyle,
          ]}
          allowFontScaling
          dynamicTypeRamp={size === 'small' ? 'subheadline' : size === 'large' ? 'headline' : 'body'}
        >
          {children}
        </Text>
      ) : (
        <View style={styles.customContent}>{children}</View>
      )}
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
    backgroundColor: semanticColors.action,
  },
  filledPressed: {
    backgroundColor: semanticColors.actionPressed,
    opacity: interaction.pressedOpacity,
  },
  filledText: {
    color: semanticColors.primaryButtonForeground,
    fontWeight: '600',
  },
  
  tintedContainer: {
    backgroundColor: semanticColors.actionTint,
  },
  tintedPressed: {
    opacity: interaction.pressedOpacity,
  },
  tintedText: {
    color: semanticColors.action,
    fontWeight: '600',
  },
  
  plainContainer: {
    backgroundColor: 'transparent',
  },
  plainPressed: {
    opacity: interaction.pressedOpacity,
  },
  plainText: {
    color: semanticColors.action,
    fontWeight: '400',
  },
  
  // Sizes
  smallContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: nativeMetrics.minimumTouchTarget,
  },
  smallText: {
    fontSize: 13,
  },
  
  mediumContainer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: nativeMetrics.minimumTouchTarget,
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
    opacity: interaction.disabledOpacity,
  },
  disabledText: {
    opacity: 1,
  },
  
  baseText: {
    textAlign: 'center',
  },
  customContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
