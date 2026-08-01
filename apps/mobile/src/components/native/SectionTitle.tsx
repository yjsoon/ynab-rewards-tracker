import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Footnote, Headline, Title2 } from '../ios/Typography';
import { interaction, nativeMetrics, spacing } from '../../theme/tokens';

export interface SectionTitleAction {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
}

export interface SectionTitleProps {
  title: string;
  subtitle?: string;
  prominence?: 'standard' | 'prominent';
  action?: SectionTitleAction;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Heading, context, and at most one action—without introducing a card shell. */
export function SectionTitle({
  title,
  subtitle,
  prominence = 'standard',
  action,
  trailing,
  style,
}: SectionTitleProps) {
  const Heading = prominence === 'prominent' ? Title2 : Headline;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.copy}>
        <Heading accessibilityRole="header">{title}</Heading>
        {subtitle ? (
          <Footnote color="secondary" style={styles.subtitle}>
            {subtitle}
          </Footnote>
        ) : null}
      </View>

      {action ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.accessibilityHint}
          accessibilityState={{ disabled: action.disabled }}
          style={({ pressed }) => [
            styles.action,
            pressed && styles.actionPressed,
            action.disabled && styles.actionDisabled,
          ]}
        >
          <Headline color="action" style={styles.actionLabel}>
            {action.label}
          </Headline>
        </Pressable>
      ) : trailing ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    columnGap: spacing.lg,
    rowGap: spacing.sm,
  },
  copy: {
    flex: 1,
    minWidth: 190,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  action: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  actionPressed: {
    opacity: interaction.pressedOpacity,
  },
  actionDisabled: {
    opacity: interaction.disabledOpacity,
  },
  actionLabel: {
    fontSize: 15,
  },
  trailing: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
  },
});
