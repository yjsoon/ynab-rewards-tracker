import React, { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Body, Headline } from '../ios/Typography';
import { Button } from '../ios/Button';
import { EmptyCardsIcon } from '../brand';
import { spacing } from '../../theme/tokens';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A calm, cardless empty state with one branded visual anchor. */
export function EmptyState({
  title,
  message,
  icon,
  action,
  secondaryAction,
  compact = false,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      <View
        style={styles.mark}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon ?? <EmptyCardsIcon width={72} height={72} />}
      </View>
      <View style={styles.copy}>
        <Headline accessibilityRole="header" style={styles.centerText}>
          {title}
        </Headline>
        {message ? (
          <Body color="secondary" style={styles.centerText}>
            {message}
          </Body>
        ) : null}
      </View>

      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? (
            <Button
              variant="filled"
              size="medium"
              onPress={action.onPress}
              accessibilityLabel={action.label}
              accessibilityHint={action.accessibilityHint}
              style={styles.action}
            >
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button
              variant="plain"
              size="medium"
              onPress={secondaryAction.onPress}
              accessibilityLabel={secondaryAction.label}
              accessibilityHint={secondaryAction.accessibilityHint}
              style={styles.action}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 390,
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  compact: {
    paddingVertical: spacing.xxl,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: spacing.xs,
  },
  action: {
    alignSelf: 'stretch',
  },
});
