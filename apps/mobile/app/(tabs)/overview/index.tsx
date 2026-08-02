import React, { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useStorage } from '@/contexts/StorageContext';
import {
  EmptyState,
  LargeNavigationTitle,
  SectionTitle,
} from '@/components/native';
import { Body, Footnote, Headline } from '@/components/ios';
import {
  createCardFormatting,
  flagColor,
  formatResetDate,
  type CardFormatting,
} from '@/features/cards/presentation';
import { useRewardsDashboard } from '@/features/cards/dashboard';
import {
  collectRewardCategories,
  rankCardUses,
  rankRewardCategoryPreview,
  type PortfolioRewardCategory,
  type RankedCardUse,
} from '@/features/cards/reward-categories';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

function compactCardName(name: string): string {
  const segments = name
    .split(/\s+·\s+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.at(-1) ?? name;
}

function decisionCurrency(value: number, formatting: CardFormatting): string {
  if (value !== 0 && Math.abs(value) < 1) {
    return formatting.currencyExact(value);
  }
  return formatting.currencyRounded(value);
}

function thresholdCurrency(value: number, formatting: CardFormatting): string {
  return Number.isInteger(value)
    ? decisionCurrency(value, formatting)
    : formatting.currencyExact(value);
}

function categoryRateLabel(
  item: PortfolioRewardCategory,
  formatting: CardFormatting,
): string {
  const rate = formatting.number(item.category.rate);
  const label = item.card.card.type === 'cashback'
    ? `${rate}% cashback`
    : `${rate} ${item.category.rate === 1 ? 'mile' : 'miles'}/${formatting.currency} 1`;
  return item.category.blockInfo
    ? `${label} · ${thresholdCurrency(item.category.blockInfo.size, formatting)} blocks`
    : label;
}

function cardUseRateLabel(
  item: RankedCardUse,
  formatting: CardFormatting,
): string {
  const rate = formatting.number(item.rate.value);
  const nativeRate = item.rate.type === 'cashback'
    ? `${rate}% cashback`
    : `${rate} ${item.rate.value === 1 ? 'mile' : 'miles'}/${formatting.currency} 1`;
  const blockAwareRate = item.rate.blockSize === null
    ? nativeRate
    : `${nativeRate} · ${thresholdCurrency(item.rate.blockSize, formatting)} blocks`;
  return item.rate.prospective ? `${blockAwareRate} after unlock` : blockAwareRate;
}

function cardUseOperationalLabel(
  item: RankedCardUse,
  formatting: CardFormatting,
): string | undefined {
  if (item.operational?.kind === 'minimum') {
    const category = item.operational.category
      ? ` on ${item.operational.category}`
      : '';
    return `${thresholdCurrency(item.operational.remaining, formatting)} more${category} before ${formatResetDate(item.operational.resetsOn)} to unlock`;
  }
  if (item.operational?.kind === 'cap') {
    return `${thresholdCurrency(item.operational.remaining, formatting)} cap room`;
  }
  return undefined;
}

function CardUseRow({
  item,
  formatting,
  onPress,
  showDivider,
}: {
  item: RankedCardUse;
  formatting: CardFormatting;
  onPress: () => void;
  showDivider: boolean;
}) {
  const rateLabel = cardUseRateLabel(item, formatting);
  const operationalLabel = cardUseOperationalLabel(item, formatting);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        item.card.card.name,
        item.use.label,
        rateLabel,
        operationalLabel,
      ].filter(Boolean).join(', ')}
      accessibilityHint={item.use.categoryId
        ? `Opens the ${item.use.label} earning tier on ${item.card.card.name}`
        : `Opens details for ${item.card.card.name}`}
      style={({ pressed }) => [
        styles.cardUseRow,
        showDivider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={styles.rowCopy}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Headline>{compactCardName(item.card.card.name)}</Headline>
        <View style={styles.useLabelRow}>
          {item.use.flagColor ? (
            <SymbolView
              name="flag.fill"
              size={14}
              tintColor={flagColor(item.use.flagColor)}
              style={styles.flagIcon}
            />
          ) : null}
          <Body style={styles.flexibleText}>{item.use.label} · {rateLabel}</Body>
        </View>
        {operationalLabel ? (
          <Footnote color="secondary" style={styles.tabular}>
            {operationalLabel}
          </Footnote>
        ) : null}
      </View>
    </Pressable>
  );
}

function SetupCardRow({
  projection,
  onPress,
  showDivider,
}: {
  projection: CardDashboardProjection;
  onPress: () => void;
  showDivider: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${projection.card.name}, Add an earning rate`}
      accessibilityHint={`Opens details for ${projection.card.name}`}
      style={({ pressed }) => [
        styles.setupRow,
        showDivider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={styles.rowCopy}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Headline>{compactCardName(projection.card.name)}</Headline>
        <Footnote color="secondary">Add an earning rate</Footnote>
      </View>
    </Pressable>
  );
}

function categorySpendOperationalState(
  item: PortfolioRewardCategory,
  formatting: CardFormatting,
): {
  label: string;
  color: 'secondary' | 'attention' | 'destructive';
} | undefined {
  const { category } = item;
  if (category.excluded) {
    return { label: 'Excluded', color: 'secondary' };
  }
  if (category.maximum.reached) {
    return { label: 'Cap reached', color: 'destructive' };
  }
  if ((category.maximum.progress ?? 0) >= 0.8) {
    return {
      label: `${thresholdCurrency(category.maximum.remaining ?? 0, formatting)} cap room`,
      color: 'attention',
    };
  }
  // Card minimums are already communicated on the relevant Keep using row.
  if (category.blockedByCardMinimum) {
    return undefined;
  }
  if (category.minimum.target !== null && category.minimum.met === false) {
    return {
      label: `${thresholdCurrency(category.minimum.remaining ?? 0, formatting)} more to meet tier minimum`,
      color: 'attention',
    };
  }
  if (category.maximum.target !== null) {
    return {
      label: `${thresholdCurrency(category.maximum.remaining ?? 0, formatting)} cap room`,
      color: 'secondary',
    };
  }
  return undefined;
}

function CategorySpendRow({
  item,
  formatting,
  onPress,
  showDivider,
}: {
  item: PortfolioRewardCategory;
  formatting: CardFormatting;
  onPress: () => void;
  showDivider: boolean;
}) {
  const rateLabel = categoryRateLabel(item, formatting);
  const spendLabel = `${decisionCurrency(item.category.spend.total, formatting)} spent`;
  const operationalState = categorySpendOperationalState(item, formatting);
  const context = `${compactCardName(item.card.card.name)}, ${rateLabel}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        item.category.name,
        item.card.card.name,
        rateLabel,
        spendLabel,
        operationalState?.label,
      ].filter(Boolean).join(', ')}
      accessibilityHint={`Opens the ${item.category.name} reward tier on ${item.card.card.name}`}
      style={({ pressed }) => [
        styles.categoryRow,
        showDivider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name="flag.fill"
        size={15}
        tintColor={flagColor(item.category.flagColor)}
        style={styles.categoryFlagIcon}
        accessibilityElementsHidden
      />
      <View
        style={styles.rowCopy}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Headline>{item.category.name}</Headline>
        <Footnote color="secondary">{context}</Footnote>
        <Headline style={styles.tabular}>{spendLabel}</Headline>
        {operationalState ? (
          <Footnote color={operationalState.color} style={styles.tabular}>
            {operationalState.label}
          </Footnote>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function OverviewScreen() {
  const router = useRouter();
  const { state } = useStorage();
  const model = useRewardsDashboard();
  const formatting = useMemo(() => createCardFormatting(state.settings), [state.settings]);

  const nonCappedCards = useMemo(
    () => model.visibleCards.filter((projection) => projection.status !== 'capped'),
    [model.visibleCards],
  );
  const cardUses = useMemo(
    () => rankCardUses(nonCappedCards, state.settings),
    [nonCappedCards, state.settings],
  );
  const setupCards = useMemo(
    () => nonCappedCards.filter((projection) => projection.status === 'unconfigured'),
    [nonCappedCards],
  );
  const rewardCategories = useMemo(
    () => collectRewardCategories(nonCappedCards),
    [nonCappedCards],
  );
  const categoryPreview = useMemo(
    () => rankRewardCategoryPreview(rewardCategories),
    [rewardCategories],
  );
  const syncActionLabel = model.canSync
    ? `${model.syncLabel} — Retry`
    : `${model.syncLabel} — Review settings`;
  const connected = Boolean(state.pat && state.selectedBudget.id);
  const hasUsableOrSetupCards = cardUses.length > 0 || setupCards.length > 0;

  const openCard = (id: string) => {
    router.push({ pathname: '/card/[id]', params: { id } });
  };

  const openCardUse = (item: RankedCardUse) => {
    router.push({
      pathname: '/card/[id]',
      params: item.use.categoryId
        ? { id: item.card.card.id, categoryId: item.use.categoryId }
        : { id: item.card.card.id },
    });
  };

  const openRewardCategory = (id: string, categoryId: string) => {
    router.push({ pathname: '/card/[id]', params: { id, categoryId } });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustsScrollIndicatorInsets
      refreshControl={(
        <RefreshControl
          refreshing={model.isRefreshing}
          onRefresh={model.refresh}
          enabled={model.canSync}
          tintColor={semanticColors.action}
          accessibilityLabel="Refresh rewards from YNAB"
        />
      )}
    >
      <View style={styles.top}>
        <LargeNavigationTitle style={styles.navigationTitle}>
          Overview
        </LargeNavigationTitle>
        {connected && state.cards.length > 0 &&
        (model.syncState === 'offline' || model.syncState === 'attention') ? (
          <Pressable
            onPress={model.canSync ? model.refresh : () => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={syncActionLabel}
            accessibilityHint={model.canSync
              ? 'Retries syncing rewards from YNAB'
              : 'Opens YNAB connection settings'}
            style={({ pressed }) => [
              styles.syncAction,
              pressed && styles.pressed,
            ]}
          >
            <Footnote color="action">{syncActionLabel}</Footnote>
          </Pressable>
        ) : null}
      </View>

      {!connected ? (
        <EmptyState
          title="Connect YNAB to begin"
          action={{
            label: 'Connect YNAB',
            onPress: () => router.push('/settings'),
            accessibilityHint: 'Opens YNAB connection settings',
          }}
        />
      ) : state.cards.length === 0 ? (
        <EmptyState
          title="Choose cards to track"
          action={{
            label: 'Manage YNAB accounts',
            onPress: () => router.push('/settings'),
            accessibilityHint: 'Opens tracked account settings',
          }}
        />
      ) : !hasUsableOrSetupCards ? (
        <EmptyState
          title="No cards to use right now"
          action={{
            label: 'View cards',
            onPress: () => router.push('/(tabs)/cards'),
            accessibilityHint: 'Opens all cards',
          }}
        />
      ) : (
        <>
          {cardUses.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Keep using" />
              <View style={styles.rows}>
                {cardUses.map((item, index) => (
                  <CardUseRow
                    key={item.key}
                    item={item}
                    formatting={formatting}
                    onPress={() => openCardUse(item)}
                    showDivider={index < cardUses.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {setupCards.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Set up" />
              <View style={styles.rows}>
                {setupCards.map((projection, index) => (
                  <SetupCardRow
                    key={projection.card.id}
                    projection={projection}
                    onPress={() => openCard(projection.card.id)}
                    showDivider={index < setupCards.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {categoryPreview.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle
                title="Category activity"
                action={{
                  label: 'See all',
                  onPress: () => router.push('/(tabs)/overview/categories'),
                  accessibilityHint: 'Opens every reward category on Overview, grouped by card',
                }}
              />
              <View style={styles.rows}>
                {categoryPreview.map((item, index) => (
                  <CategorySpendRow
                    key={item.key}
                    item={item}
                    formatting={formatting}
                    onPress={() => openRewardCategory(item.card.card.id, item.category.id)}
                    showDivider={index < categoryPreview.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.md,
    paddingBottom: 120,
    gap: spacing.xxl,
  },
  top: {
    gap: spacing.sm,
  },
  navigationTitle: {
    marginTop: spacing.sm,
  },
  syncAction: {
    minHeight: nativeMetrics.minimumTouchTarget,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  section: {
    gap: spacing.md,
  },
  rows: {
    marginHorizontal: -spacing.md,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    overflow: 'hidden',
  },
  cardUseRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  setupRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  categoryRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  useLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flexibleText: {
    flex: 1,
    minWidth: 0,
  },
  flagIcon: {
    flexShrink: 0,
    marginTop: 3,
  },
  categoryFlagIcon: {
    flexShrink: 0,
    marginTop: 2,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  pressed: {
    opacity: interaction.subtlePressedOpacity,
  },
});
