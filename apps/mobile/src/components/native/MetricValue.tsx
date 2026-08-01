import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Caption1, Footnote, Headline, Title2, Title3, type TextColor } from '../ios/Typography';
import { spacing } from '../../theme/tokens';

export type MetricTone = 'primary' | 'secondary' | 'positive' | 'attention' | 'destructive';

export interface MetricValueProps {
  label: string;
  value: string | number;
  detail?: string;
  size?: 'compact' | 'medium' | 'large';
  tone?: MetricTone;
  align?: 'left' | 'right';
  accessible?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const toneToTextColor: Record<MetricTone, TextColor> = {
  primary: 'primary',
  secondary: 'secondary',
  positive: 'positive',
  attention: 'attention',
  destructive: 'destructive',
};

/** A Dynamic Type-safe, tabular metric that stays scannable without a tile. */
export function MetricValue({
  label,
  value,
  detail,
  size = 'medium',
  tone = 'primary',
  align = 'left',
  accessible = true,
  accessibilityLabel,
  style,
}: MetricValueProps) {
  const alignmentStyle = align === 'right' ? styles.alignRight : styles.alignLeft;
  const textAlignmentStyle = align === 'right' ? styles.textAlignRight : styles.textAlignLeft;
  const color = toneToTextColor[tone];
  const valueStyle = [styles.value, textAlignmentStyle];

  const Value = size === 'large' ? Title2 : size === 'medium' ? Title3 : Headline;
  const Label = size === 'compact' ? Caption1 : Footnote;

  return (
    <View
      style={[styles.container, alignmentStyle, style]}
      accessible={accessible}
      accessibilityRole={accessible ? 'text' : undefined}
      accessibilityLabel={
        accessible
          ? accessibilityLabel ?? `${label}, ${String(value)}${detail ? `, ${detail}` : ''}`
          : undefined
      }
    >
      <Value color={color} accessible={false} style={valueStyle}>
        {value}
      </Value>
      <Label color="secondary" accessible={false} style={textAlignmentStyle}>
        {label}
      </Label>
      {detail ? (
        <Caption1 color="secondary" accessible={false} style={textAlignmentStyle}>
          {detail}
        </Caption1>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
    minWidth: 0,
  },
  value: {
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  textAlignLeft: {
    textAlign: 'left',
  },
  textAlignRight: {
    textAlign: 'right',
  },
});
