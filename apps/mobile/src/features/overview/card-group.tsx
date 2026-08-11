import React from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Headline, Title2 } from '@/components/ios';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, spacing } from '@/theme/tokens';

export interface CardGroupHeaderProps {
  title: string;
  count: number;
  icon: 'percent' | 'chart.line.uptrend.xyaxis';
  iconColor: ColorValue | undefined;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Collapsible section header for the type-grouped dashboard grid, mirroring
 * the web dashboard's cashback/miles groups with count badges.
 */
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
          name={icon}
          size={15}
          tintColor={iconColor}
          style={styles.icon}
          accessibilityElementsHidden
        />
        <Headline accessible={false}>{title}</Headline>
      </View>
      <View style={styles.trailing}>
        <Title2 color="secondary" style={styles.count} accessible={false}>
          {count}
        </Title2>
        <SymbolView
          name="chevron.down"
          size={12}
          tintColor={semanticColors.tertiaryLabel}
          style={collapsed && styles.chevronCollapsed}
          accessibilityElementsHidden
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    flexShrink: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
  chevronCollapsed: {
    transform: [{ rotate: '-90deg' }],
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
