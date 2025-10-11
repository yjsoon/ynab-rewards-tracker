import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { semanticColors } from '../../theme/semanticColors';

type TextVariant =
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

interface TypographyProps {
  children: React.ReactNode;
  variant?: TextVariant;
  color?: 'primary' | 'secondary' | 'tertiary' | 'quaternary';
  style?: TextStyle;
  numberOfLines?: number;
  allowFontScaling?: boolean;
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
  numberOfLines,
  allowFontScaling = true,
}: TypographyProps) {
  return (
    <Text
      style={[styles[variant], styles[`${color}Color`], style]}
      numberOfLines={numberOfLines}
      allowFontScaling={allowFontScaling}
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
  // Text styles (iOS Dynamic Type scale)
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 41,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 25,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 22,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 21,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 13,
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
});