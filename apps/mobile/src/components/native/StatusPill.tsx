import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Caption1, Footnote } from '../ios/Typography';
import { semanticColors } from '../../theme/semanticColors';

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
  accessible?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

function toneStyles(tone: StatusTone) {
  switch (tone) {
    case 'accent':
      return styles.accentText;
    case 'positive':
      return styles.positiveText;
    case 'attention':
      return styles.attentionText;
    case 'capped':
      return styles.cappedText;
    case 'inactive':
      return styles.inactiveText;
    case 'neutral':
      return styles.neutralText;
  }
}

/** Quiet, non-interactive status text. Reserve colour for states that need attention. */
export function StatusPill({
  label,
  tone = 'neutral',
  size = 'regular',
  accessible = true,
  accessibilityLabel,
  style,
  textStyle,
}: StatusPillProps) {
  const textTone = toneStyles(tone);
  const Label = size === 'small' ? Caption1 : Footnote;

  return (
    <View
      style={[styles.container, style]}
      accessible={accessible}
      accessibilityRole={accessible ? 'text' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel ?? label : undefined}
    >
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
    maxWidth: '100%',
  },
  label: {
    flexShrink: 1,
    fontWeight: '600',
  },
  neutralText: {
    color: semanticColors.secondaryLabel,
  },
  accentText: {
    color: semanticColors.secondaryLabel,
  },
  positiveText: {
    color: semanticColors.secondaryLabel,
  },
  attentionText: {
    color: semanticColors.attention,
  },
  cappedText: {
    color: semanticColors.capped,
  },
  inactiveText: {
    color: semanticColors.tertiaryLabel,
  },
});
