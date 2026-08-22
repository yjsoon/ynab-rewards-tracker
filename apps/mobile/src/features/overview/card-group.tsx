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
      <SymbolView
        name="chevron.down"
        size={11}
        tintColor={semanticColors.tertiaryLabel}
        style={collapsed && styles.chevronCollapsed}
        accessibilityElementsHidden
      />
      <SymbolView
        name={icon}
        size={13}
        tintColor={iconColor}
        style={styles.icon}
        accessibilityElementsHidden
      />
      <Caption1 color="secondary" style={styles.title} accessible={false}>
        {title}
      </Caption1>
      <View style={styles.badge}>
        <Footnote color="secondary" style={styles.count} accessible={false}>
          {count}
        </Footnote>
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
  icon: {
    flexShrink: 0,
  },
  title: {
    flexShrink: 1,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.tertiarySystemFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 13,
  },
  chevronCollapsed: {
    transform: [{ rotate: '-90deg' }],
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
