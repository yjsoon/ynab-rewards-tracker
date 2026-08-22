import React from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Caption1, Footnote } from '@/components/ios';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';

export interface CardGroupHeaderProps {
  title: string;
  count: number;
  icon: 'percent' | 'chart.line.uptrend.xyaxis';
  iconColor: ColorValue | undefined;
  collapsed: boolean;
  onToggle: () => void;
}

export function CardGroupHeader({
  title,
  count,
  icon,
  iconColor,
  collapsed,
  onToggle,
}: CardGroupHeaderProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${count} ${count === 1 ? 'card' : 'cards'}`}
      accessibilityState={{ expanded: !collapsed }}
      accessibilityHint={collapsed ? 'Expands this group' : 'Collapses this group'}
      style={({ pressed }) => [styles.header, pressed && styles.pressed]}
    >
      <View style={styles.identity}>
        <SymbolView
          name={collapsed ? 'chevron.right' : 'chevron.down'}
          size={13}
          tintColor={semanticColors.tertiaryLabel}
          style={styles.icon}
          accessibilityElementsHidden
        />
        <SymbolView
          name={icon}
          size={13}
          tintColor={iconColor}
          style={styles.icon}
          accessibilityElementsHidden
        />
        <Footnote color="secondary" style={styles.title} accessible={false}>
          {title}
        </Footnote>
      </View>
      <View style={styles.badge} accessibilityElementsHidden>
        <Caption1 color="secondary" style={styles.count}>
          {count}
        </Caption1>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
    flexShrink: 1,
  },
  icon: {
    flexShrink: 0,
  },
  title: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.tertiarySystemFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
