import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ColorValue,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Body, Footnote, Headline } from '@/components/ios';
import { SectionTitle } from '@/components/native';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { TextColor } from '@/components/ios/Typography';
import type { CardFormatting } from './presentation';
import { flagColour } from './presentation';
import type { PortfolioRewardCategory } from './reward-categories';

type OperationalState = {
  label: string;
  color: TextColor;
};

function categoryRateLabel(
  item: PortfolioRewardCategory,
  formatting: CardFormatting,
): string {
  const { card, category } = item;
  const rate = formatting.number(category.rate);
  const rateLabel = card.card.type === 'cashback'
    ? `${rate}% cashback`
    : `${rate} ${category.rate === 1 ? 'mile' : 'miles'} per ${formatting.currency} 1`;
  return category.blockInfo
    ? `${rateLabel} · ${formatting.currencyCompact(category.blockInfo.size)} blocks`
    : rateLabel;
}

function compactCardName(name: string): string {
  const segments = name
    .split(/\s+·\s+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.at(-1) ?? name;
}

function categoryRewardLabel(
  item: PortfolioRewardCategory,
  formatting: CardFormatting,
): string {
  if (item.category.reward.type === 'cashback') {
    return `${formatting.currencyExact(item.category.reward.amount)} earned`;
  }
  return `${formatting.number(item.category.reward.amount)} miles earned`;
}

function thresholdAmount(value: number, formatting: CardFormatting): string {
  return `${formatting.currency} ${formatting.number(value)}`;
}

export function rewardCategoryOperationalState(
  item: PortfolioRewardCategory,
  formatting: CardFormatting,
): OperationalState {
  const { card, category } = item;

  if (category.excluded) {
    return { label: 'Excluded', color: 'secondary' };
  }
  if (category.maximum.reached) {
    return { label: 'Cap reached', color: 'destructive' };
  }
  if ((category.maximum.progress ?? 0) >= 0.8) {
    return {
      label: `Cap · ${thresholdAmount(category.maximum.remaining ?? 0, formatting)} left`,
      color: 'attention',
    };
  }
  if (category.blockedByCardMinimum) {
    return {
      label: `Card min · ${thresholdAmount(card.minimum.remaining ?? 0, formatting)} left`,
      color: 'attention',
    };
  }
  if (category.minimum.target !== null && category.minimum.met === false) {
    return {
      label: `Tier min · ${thresholdAmount(category.minimum.remaining ?? 0, formatting)} left`,
      color: 'attention',
    };
  }
  if (category.maximum.target !== null) {
    return {
      label: `Cap · ${thresholdAmount(category.maximum.remaining ?? 0, formatting)} left`,
      color: 'secondary',
    };
  }
  if (category.reward.amount > 0) {
    return { label: categoryRewardLabel(item, formatting), color: 'positive' };
  }
  if (category.spend.total > 0) {
    return { label: 'No reward yet', color: 'secondary' };
  }
  return { label: 'No spend yet', color: 'secondary' };
}

type RailSegment = {
  key: string;
  color: ColorValue;
  spend: number;
};

function railSegments(categories: PortfolioRewardCategory[]): RailSegment[] {
  const spentCategories = categories
    .filter(({ category }) => category.spend.total > 0)
    .sort((left, right) => right.category.spend.total - left.category.spend.total);

  if (spentCategories.length <= 5) {
    return spentCategories.map((item) => ({
      key: item.key,
      color: flagColour(item.category.flagColor),
      spend: item.category.spend.total,
    }));
  }

  const leading = spentCategories.slice(0, 4).map((item) => ({
    key: item.key,
    color: flagColour(item.category.flagColor),
    spend: item.category.spend.total,
  }));
  return [
    ...leading,
    {
      key: 'other',
      color: semanticColors.systemGray,
      spend: spentCategories
        .slice(4)
        .reduce((total, item) => total + item.category.spend.total, 0),
    },
  ];
}

export function RewardCategoryCompositionRail({
  categories,
  formatting,
  onPress,
}: {
  categories: PortfolioRewardCategory[];
  formatting: CardFormatting;
  onPress?: () => void;
}) {
  const segments = useMemo(() => railSegments(categories), [categories]);
  const totalSpend = categories.reduce(
    (total, item) => total + item.category.spend.total,
    0,
  );
  const accessibilityLabel = totalSpend > 0
    ? `Reward category spend, ${categories
        .filter(({ category }) => category.spend.total > 0)
        .map((item) => `${item.category.name} on ${item.card.card.name}, ${formatting.currencyCompact(item.category.spend.total)}`)
        .join('; ')}`
    : 'No reward category spend this period';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={onPress ? { top: 16, bottom: 16 } : undefined}
      accessible
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress ? 'Opens all reward categories' : undefined}
      style={({ pressed }) => [
        styles.railTouchTarget,
        pressed && onPress && styles.pressed,
      ]}
    >
      {segments.length > 0 ? (
        <View
          style={styles.compositionRail}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {segments.map((segment) => (
            <View
              key={segment.key}
              style={[
                styles.compositionSegment,
                { backgroundColor: segment.color, flexGrow: segment.spend },
              ]}
            />
          ))}
        </View>
      ) : (
        <Footnote
          color="secondary"
          accessible={false}
          accessibilityElementsHidden
        >
          No category spend this period
        </Footnote>
      )}
    </Pressable>
  );
}

function thresholdProgress(item: PortfolioRewardCategory): {
  progress: number;
  color: ColorValue;
} | null {
  if (item.category.excluded) {
    return null;
  }
  if (item.category.maximum.reached) {
    return {
      progress: 1,
      color: semanticColors.destructive,
    };
  }
  if ((item.category.maximum.progress ?? 0) >= 0.8) {
    return {
      progress: item.category.maximum.progress ?? 0,
      color: semanticColors.attention,
    };
  }
  if (item.category.blockedByCardMinimum) {
    return null;
  }
  if (item.category.minimum.target !== null && item.category.minimum.met === false) {
    return {
      progress: item.category.minimum.progress ?? 0,
      color: semanticColors.attention,
    };
  }
  if (item.category.maximum.target !== null) {
    return {
      progress: item.category.maximum.progress ?? 0,
      color: semanticColors.action,
    };
  }
  return null;
}

export function RewardCategoryRow({
  item,
  formatting,
  onPress,
  showDivider = true,
  showCardName = true,
}: {
  item: PortfolioRewardCategory;
  formatting: CardFormatting;
  onPress: () => void;
  showDivider?: boolean;
  showCardName?: boolean;
}) {
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || (width <= 375 && fontScale >= 1.15);
  const operationalState = rewardCategoryOperationalState(item, formatting);
  const rateLabel = categoryRateLabel(item, formatting);
  const spendLabel = formatting.currencyCompact(item.category.spend.total);
  const progress = thresholdProgress(item);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.category.name}, ${item.card.card.name}, ${rateLabel}, ${spendLabel} spent, ${operationalState.label}`}
      accessibilityHint={`Opens the ${item.category.name} reward tier on ${item.card.card.name}`}
      style={({ pressed }) => [
        styles.categoryRow,
        showDivider && styles.categoryDivider,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[styles.categoryBody, stacked && styles.categoryBodyStacked]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.categoryIdentity, stacked && styles.categoryIdentityStacked]}>
          <SymbolView
            name="flag.fill"
            size={15}
            tintColor={flagColour(item.category.flagColor)}
            style={styles.flagIcon}
          />
          <View style={styles.categoryCopy}>
            <Headline numberOfLines={2}>{item.category.name}</Headline>
            <Footnote color="secondary" numberOfLines={stacked ? undefined : 1}>
              {showCardName
                ? `${compactCardName(item.card.card.name)} · ${rateLabel}`
                : rateLabel}
            </Footnote>
          </View>
        </View>

        <View style={[styles.categoryTrailing, stacked && styles.categoryTrailingStacked]}>
          <Headline style={styles.tabular}>{spendLabel}</Headline>
          <Footnote color={operationalState.color} style={styles.tabular}>
            {operationalState.label}
          </Footnote>
        </View>
      </View>

      {progress ? (
        <View
          style={styles.thresholdTrack}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[
              styles.thresholdFill,
              { backgroundColor: progress.color },
              { width: `${Math.max(0, Math.min(1, progress.progress)) * 100}%` },
            ]}
          />
        </View>
      ) : null}

      <SymbolView
        name="chevron.right"
        size={11}
        tintColor={semanticColors.tertiaryLabel}
        style={styles.chevron}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export function RewardCategorySummary({
  categories,
  preview,
  formatting,
  setupCount,
  onSeeAll,
  onOpenCard,
  onReviewCards,
}: {
  categories: PortfolioRewardCategory[];
  preview: PortfolioRewardCategory[];
  formatting: CardFormatting;
  setupCount: number;
  onSeeAll: () => void;
  onOpenCard: (cardId: string, categoryId: string) => void;
  onReviewCards: () => void;
}) {
  return (
    <View style={styles.summary}>
      <SectionTitle
        title="Reward categories"
        action={categories.length > 0 ? {
          label: `See all (${categories.length})`,
          onPress: onSeeAll,
          accessibilityHint: 'Opens every reward category on Overview, grouped by card',
        } : undefined}
      />

      {categories.length > 0 ? (
        <>
          <RewardCategoryCompositionRail
            categories={categories}
            formatting={formatting}
            onPress={onSeeAll}
          />
          <View style={styles.categoryRows}>
            {preview.map((item, index) => (
              <RewardCategoryRow
                key={item.key}
                item={item}
                formatting={formatting}
                onPress={() => onOpenCard(item.card.card.id, item.category.id)}
                showDivider={index < preview.length - 1}
              />
            ))}
          </View>
        </>
      ) : (
        <Pressable
          onPress={onReviewCards}
          accessibilityRole="button"
          accessibilityLabel="No active reward categories. Review cards"
          style={({ pressed }) => [styles.emptyCategories, pressed && styles.pressed]}
        >
          <Body>No active reward categories</Body>
          <Footnote color="action">Review cards</Footnote>
        </Pressable>
      )}

      {setupCount > 0 ? (
        <Pressable
          onPress={onReviewCards}
          accessibilityRole="button"
          accessibilityLabel={`${setupCount} ${setupCount === 1 ? 'card needs' : 'cards need'} reward setup`}
          style={({ pressed }) => [styles.setupLink, pressed && styles.pressed]}
        >
          <Footnote color="action">
            {setupCount} {setupCount === 1 ? 'card needs' : 'cards need'} reward setup
          </Footnote>
          <SymbolView
            name="chevron.right"
            size={10}
            tintColor={semanticColors.action}
            accessibilityElementsHidden
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.sm,
  },
  railTouchTarget: {
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  compositionRail: {
    height: 11,
    flexDirection: 'row',
    gap: 2,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: semanticColors.progressTrack,
  },
  compositionSegment: {
    flexBasis: 0,
    minWidth: 2,
    height: 11,
  },
  categoryRows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.separator,
  },
  categoryRow: {
    position: 'relative',
    minHeight: 62,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingRight: spacing.xl,
  },
  categoryDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  categoryBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  categoryBodyStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  categoryIdentity: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  categoryIdentityStacked: {
    flex: 0,
  },
  flagIcon: {
    width: 18,
    marginTop: 2,
  },
  categoryCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  categoryTrailing: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  categoryTrailingStacked: {
    alignItems: 'flex-start',
    paddingLeft: 26,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  thresholdTrack: {
    height: 3,
    marginTop: spacing.sm,
    marginLeft: 26,
    marginRight: spacing.xs,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: semanticColors.tertiarySystemFill,
  },
  thresholdFill: {
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.action,
  },
  chevron: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -6,
  },
  setupLink: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  emptyCategories: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.separator,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
