import React from 'react';
import { Text, StyleSheet } from 'react-native';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { semanticColors } from '../../theme/semanticColors';

export type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2';

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'quaternary'
  | 'action'
  | 'positive'
  | 'attention'
  | 'destructive'
  | 'inverse';

export interface TypographyProps extends Omit<TextProps, 'style'> {
  variant?: TextVariant;
  color?: TextColor;
  style?: StyleProp<TextStyle>;
}

/**
 * iOS typography system based on SF Pro Dynamic Type
 * Follows Apple's text style guidelines
 */
export function Typography({
  children,
  variant = 'body',
  color = 'primary',
  style,
  allowFontScaling = true,
  ...textProps
}: TypographyProps) {
  // Safe color style mapping
  const getColorStyle = (c: NonNullable<TypographyProps['color']>) => {
    switch (c) {
      case 'primary': return styles.primaryColor;
      case 'secondary': return styles.secondaryColor;
      case 'tertiary': return styles.tertiaryColor;
      case 'quaternary': return styles.quaternaryColor;
      case 'action': return styles.actionColor;
      case 'positive': return styles.positiveColor;
      case 'attention': return styles.attentionColor;
      case 'destructive': return styles.destructiveColor;
      case 'inverse': return styles.inverseColor;
    }
  };

  return (
    <Text
      {...textProps}
      style={[styles[variant], getColorStyle(color), style]}
      allowFontScaling={allowFontScaling}
      dynamicTypeRamp={variant}
      lineBreakStrategyIOS="standard"
      textBreakStrategy="highQuality"
    >
      {children}
    </Text>
  );
}

// Convenience components
export function LargeTitle(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="largeTitle" {...props} />;
}

export function Title1(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="title1" {...props} />;
}

export function Title2(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="title2" {...props} />;
}

export function Title3(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="title3" {...props} />;
}

export function Headline(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="headline" {...props} />;
}

export function Body(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="body" {...props} />;
}

export function Callout(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="callout" {...props} />;
}

export function Subheadline(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="subheadline" {...props} />;
}

export function Footnote(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="footnote" {...props} />;
}

export function Caption1(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="caption1" {...props} />;
}

export function Caption2(props: Omit<TypographyProps, 'variant'>) {
  return <Typography variant="caption2" {...props} />;
}

const styles = StyleSheet.create({
  // Base sizes match iOS text styles. dynamicTypeRamp handles every
  // accessibility category; omitting fixed line heights prevents clipping.
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700',
  },
  title3: {
    fontSize: 20,
    fontWeight: '600',
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
  },
  callout: {
    fontSize: 16,
    fontWeight: '400',
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400',
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400',
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400',
  },

  // Color variants using semantic iOS colors
  primaryColor: {
    color: semanticColors.label,
  },
  secondaryColor: {
    color: semanticColors.secondaryLabel,
  },
  tertiaryColor: {
    color: semanticColors.tertiaryLabel,
  },
  quaternaryColor: {
    color: semanticColors.quaternaryLabel,
  },
  actionColor: {
    color: semanticColors.action,
  },
  positiveColor: {
    color: semanticColors.positive,
  },
  attentionColor: {
    color: semanticColors.attention,
  },
  destructiveColor: {
    color: semanticColors.destructive,
  },
  inverseColor: {
    color: semanticColors.primaryButtonForeground,
  },
});
