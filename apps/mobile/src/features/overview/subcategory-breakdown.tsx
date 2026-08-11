import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Caption1, Footnote, Headline } from '@/components/ios';
import type { CardFormatting } from '@/features/cards/presentation';
import { flagColor } from '@/features/cards/presentation';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { TextColor } from '@/components/ios/Typography';
import type { RewardCategoryProjection } from '@ynab-counter/app-core/rewards-engine';

const NEAR_CAP_RATIO = 0.8;
const MIN_SEGMENT_RATIO = 0.025;

interface Segment {
  key: string;
  color: ColorValue;
  spend: number;
}

function segmentsFor(categories: RewardCategoryProjection[]): Segment[] {
  const total = categories.reduce((sum, category) => sum + category.spend.total, 0);
  if (total <= 0) {
    return [];
  }
  return categories
    .filter((category) => category.spend.total / total >= MIN_SEGMENT_RATIO)
    .sort((left, right) => right.spend.total - left.spend.total)
    .map((category) => ({
      key: category.id,
      color: flagColor(category.flagColor),
      spend: category.spend.total,
    }));
}

function capPercentage(
  category: RewardCategoryProjection,
): number | null {
  if (category.maximum.target === null || category.maximum.target <= 0) {
    return null;
  }
  const percent = ((category.spend.total / category.maximum.target) * 100);
  return Math.round(percent);
}

function capPercentTone(percent: number): TextColor {
  if (percent >= 90) {
    return 'destructive';
  }
  if (percent >= 75) {
    return 'attention';
  }
  return 'secondary';
}

function capPercentLabel(category: RewardCategoryProjection, formatting: CardFormatting): string | undefined {
  const percent = capPercentage(category);
  const target = category.maximum.target;
  if (percent === null || target === null || target <= 0) {
    return undefined;
  }
  const spent = formatting.currencyCompact(category.spend.total);
  const cap = formatting.currencyCompact(target);
  const tone = capPercentTone(percent);
  return `${spent} of ${cap} · ${percent}%`;
}

export interface CardSubcategoryBreakdownProps {
  categories: RewardCategoryProjection[];
  formatting: CardFormatting;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

/**
 * Per-card composition: a flag-coloured stacked bar plus expandable rows with
 * spend against each tier's cap. Mirrors the web summary compact breakdown.
 */
export function CardSubcategoryBreakdown({
  categories,
  formatting,
  isExpanded,
  onToggleExpanded,
}: CardSubcategoryBreakdownProps) {
  const segments = useMemo(() => segmentsFor(categories), [categories]);
  const totalSpend = useMemo(
    () => categories.reduce((sum, category) => sum + category.spend.total, 0),
    [categories],
  );
  const rows = useMemo(
    () => [...categories].sort((left, right) => right.spend.total - left.spend.total),
    [categories],
  );

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`Reward categories, ${totalSpend > 0 ? `${rows
          .filter((category) => category.spend.total > 0)
          .map((category) => `${category.name}, ${formatting.currencyCompact(category.spend.total)}`)
          .join(', ')}` : 'no spend this period'}`}
        accessibilityHint={isExpanded ? 'Collapses reward category detail' : 'Expands reward category detail'}
        accessibilityState={{ expanded: isExpanded }}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <Caption1 color="secondary" style={styles.eyebrow} accessible={false}>
          Categories
        </Caption1>
        <SymbolView
          name="chevron.down"
          size={10}
          tintColor={semanticColors.tertiaryLabel}
          style={[styles.chevron, isExpanded && styles.chevronExpanded]}
          accessibilityElementsHidden
        />
      </Pressable>

      {segments.length > 0 ? (
        <View
          style={styles.bar}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {segments.map((segment) => (
            <View
              key={segment.key}
              style={[
                styles.segment,
                { backgroundColor: segment.color, flexGrow: segment.spend },
              ]}
            />
          ))}
        </View>
      ) : null}

      {isExpanded ? (
        <View style={styles.rows}>
          {rows.map((category, index) => {
            const percent = capPercentage(category);
            const percentLabel = capPercentLabel(category, formatting);
            return (
              <View
                key={category.id}
                style={[styles.row, index < rows.length - 1 && styles.rowDivider]}
                accessible
                accessibilityLabel={`${category.name}, ${formatting.currencyCompact(category.spend.total)} spent${percentLabel ? `, ${percentLabel}` : ''}`}
              >
                <View style={styles.rowIdentity} accessibilityElementsHidden>
                  <View style={[styles.flagDot, { backgroundColor: flagColor(category.flagColor) }]} />
                  <Headline style={styles.rowName} numberOfLines={1}>{category.name}</Headline>
                </View>
                <View style={styles.rowTrailing} accessibilityElementsHidden>
                  {percent !== null ? (
                    <Footnote color={capPercentTone(percent)} style={styles.tabular}>
                      {percentLabel}
                    </Footnote>
                  ) : (
                    <Footnote color="secondary" style={styles.tabular}>
                      {formatting.currencyCompact(category.spend.total)}
                    </Footnote>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  chevron: {},
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  bar: {
    height: 11,
    flexDirection: 'row',
    gap: 2,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: semanticColors.progressTrack,
  },
  segment: {
    flexBasis: 0,
    minWidth: 2,
    height: 11,
  },
  rows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.separator,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xxs,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
    paddingBottom: spacing.sm,
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flagDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    flexShrink: 0,
  },
  rowName: {
    flex: 1,
    minWidth: 0,
  },
  rowTrailing: {
    flexShrink: 0,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
