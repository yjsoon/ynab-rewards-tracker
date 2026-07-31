import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import {
  Caption1,
  Footnote,
  Headline,
} from '@/components/ios';
import { useHaptics } from '@/hooks/useHaptics';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { TransactionProjection } from '@ynab-counter/app-core/rewards-engine';
import {
  createActivityFormatting,
  flagColorValue,
  formatFlagName,
  formatRewardShort,
  formatTransactionAmount,
} from './presentation';
import type { AppSettings } from '@ynab-counter/app-core/storage';

export interface TransactionRowProps {
  projection: TransactionProjection;
  settings: AppSettings;
  onPress: () => void;
  position: 'only' | 'first' | 'middle' | 'last';
}

export function TransactionRow({
  projection,
  settings,
  onPress,
  position,
}: TransactionRowProps) {
  const { selection } = useHaptics();
  const formatting = useMemo(() => createActivityFormatting(settings), [settings]);
  const transaction = projection.transaction;
  const payee = transaction.payee_name?.trim()
    || projection.account.name
    || 'Unknown merchant';
  const category = transaction.category_name?.trim() || 'Uncategorised';
  const account = projection.account.name || projection.card?.name || 'Unknown account';
  const reward = formatRewardShort(projection, formatting);
  const amount = formatTransactionAmount(projection, formatting);
  const flagName = formatFlagName(transaction.flag_name, transaction.flag_color);
  const isEarning = projection.status === 'earning';

  const accessibilityLabel = [
    payee,
    projection.status === 'incoming' ? `incoming ${amount}` : `spent ${amount}`,
    reward,
    category,
    account,
    flagName,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Shows transaction and reward details"
      style={({ pressed }) => [
        styles.row,
        (position === 'first' || position === 'only') && styles.first,
        (position === 'last' || position === 'only') && styles.last,
        (position === 'middle' || position === 'last') && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.copy} accessibilityElementsHidden>
        <Headline numberOfLines={2} style={styles.payee}>{payee}</Headline>
        <View style={styles.contextLine}>
          {transaction.flag_color ? (
            <View
              style={[
                styles.flagDot,
                { backgroundColor: flagColorValue(transaction.flag_color) },
              ]}
            />
          ) : null}
          <Footnote color="secondary" numberOfLines={2} style={styles.context}>
            {category} · {account}
          </Footnote>
        </View>
      </View>

      <View style={styles.trailing} accessibilityElementsHidden>
        <Headline style={projection.status === 'incoming' ? styles.incoming : undefined}>
          {amount}
        </Headline>
        <Caption1
          color={isEarning ? 'positive' : 'secondary'}
          numberOfLines={2}
          style={styles.reward}
        >
          {reward}
        </Caption1>
      </View>

      <SymbolView
        name="chevron.right"
        size={13}
        weight="semibold"
        tintColor={semanticColors.tertiaryLabel}
        accessibilityElementsHidden
        style={styles.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    marginHorizontal: nativeMetrics.screenGutter,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  first: {
    borderTopLeftRadius: radii.medium,
    borderTopRightRadius: radii.medium,
  },
  last: {
    borderBottomLeftRadius: radii.medium,
    borderBottomRightRadius: radii.medium,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.separator,
  },
  pressed: {
    backgroundColor: semanticColors.tertiarySystemFill,
    opacity: interaction.subtlePressedOpacity,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  payee: {
    flexShrink: 1,
  },
  contextLine: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  context: {
    flex: 1,
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  trailing: {
    flexShrink: 1,
    maxWidth: '40%',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  reward: {
    textAlign: 'right',
    fontWeight: '600',
  },
  incoming: {
    color: semanticColors.positive,
  },
  chevron: {
    flexShrink: 0,
  },
});
