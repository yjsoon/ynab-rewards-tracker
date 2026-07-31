import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Caption1, Caption2 } from '../ios/Typography';
import { semanticColors } from '../../theme/semanticColors';
import { radii, spacing } from '../../theme/tokens';

export type StatusTone =
  | 'neutral'
  | 'accent'
  | 'positive'
  | 'attention'
  | 'capped'
  | 'inactive';

export interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  size?: 'small' | 'regular';
  showDot?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

function toneStyles(tone: StatusTone) {
  switch (tone) {
    case 'accent':
      return [styles.accentContainer, styles.accentDot, styles.accentText] as const;
    case 'positive':
      return [styles.positiveContainer, styles.positiveDot, styles.positiveText] as const;
    case 'attention':
      return [styles.attentionContainer, styles.attentionDot, styles.attentionText] as const;
    case 'capped':
      return [styles.cappedContainer, styles.cappedDot, styles.cappedText] as const;
    case 'inactive':
      return [styles.inactiveContainer, styles.inactiveDot, styles.inactiveText] as const;
    case 'neutral':
      return [styles.neutralContainer, styles.neutralDot, styles.neutralText] as const;
  }
}

/** Compact, non-interactive status with redundant shape, text, and colour cues. */
export function StatusPill({
  label,
  tone = 'neutral',
  size = 'regular',
  showDot = true,
  accessible = true,
  accessibilityLabel,
  style,
  textStyle,
}: StatusPillProps) {
  const [containerTone, dotTone, textTone] = toneStyles(tone);
  const Label = size === 'small' ? Caption2 : Caption1;

  return (
    <View
      style={[
        styles.container,
        size === 'small' ? styles.smallContainer : styles.regularContainer,
        containerTone,
        style,
      ]}
      accessible={accessible}
      accessibilityRole={accessible ? 'text' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel ?? label : undefined}
    >
      {showDot ? (
        <View
          style={[
            styles.dot,
            size === 'small' && styles.smallDot,
            dotTone,
          ]}
        />
      ) : null}
      <Label
        accessible={false}
        style={[styles.label, textTone, textStyle]}
      >
        {label}
      </Label>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  regularContainer: {
    minHeight: 26,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 6,
  },
  smallContainer: {
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: spacing.xs,
  },
  label: {
    flexShrink: 1,
    fontWeight: '600',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  smallDot: {
    width: 6,
    height: 6,
  },
  neutralContainer: {
    backgroundColor: semanticColors.neutralTint,
    borderColor: semanticColors.separator,
  },
  neutralDot: {
    backgroundColor: semanticColors.systemGray,
  },
  neutralText: {
    color: semanticColors.secondaryLabel,
  },
  accentContainer: {
    backgroundColor: semanticColors.actionTint,
    borderColor: semanticColors.action,
  },
  accentDot: {
    backgroundColor: semanticColors.action,
  },
  accentText: {
    color: semanticColors.action,
  },
  positiveContainer: {
    backgroundColor: semanticColors.positiveTint,
    borderColor: semanticColors.positive,
  },
  positiveDot: {
    backgroundColor: semanticColors.positive,
  },
  positiveText: {
    color: semanticColors.positive,
  },
  attentionContainer: {
    backgroundColor: semanticColors.attentionTint,
    borderColor: semanticColors.attention,
  },
  attentionDot: {
    backgroundColor: semanticColors.attention,
  },
  attentionText: {
    color: semanticColors.attention,
  },
  cappedContainer: {
    backgroundColor: semanticColors.destructiveTint,
    borderColor: semanticColors.capped,
  },
  cappedDot: {
    backgroundColor: semanticColors.capped,
  },
  cappedText: {
    color: semanticColors.capped,
  },
  inactiveContainer: {
    backgroundColor: semanticColors.neutralTint,
    borderColor: semanticColors.separator,
  },
  inactiveDot: {
    backgroundColor: semanticColors.systemGray2,
  },
  inactiveText: {
    color: semanticColors.tertiaryLabel,
  },
});
