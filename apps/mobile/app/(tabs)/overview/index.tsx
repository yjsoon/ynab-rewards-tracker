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
  SyncBadge,
} from '@/components/native';
import {
  Body,
  Footnote,
  Headline,
  LargeTitle,
} from '@/components/ios';
import {
  attentionCopy,
  createCardFormatting,
  flagColor,
  formatResetDate,
  type CardFormatting,
} from '@/features/cards/presentation';
import { useRewardsDashboard } from '@/features/cards/dashboard';
import { RewardCategoryRow } from '@/features/cards/RewardCategoryBreakdown';
import {
  collectRewardCategories,
  rankRewardCategoryEarnings,
  rankRewardCategoryPreview,
  type PortfolioRewardCategory,
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

function attentionDetail({
  projection,
  formatting,
}: {
  projection: CardDashboardProjection;
  formatting: CardFormatting;
}): string | undefined {
  switch (projection.status) {
    case 'building':
      return projection.minimum.target === null
        ? undefined
        : `${formatting.currencyCompact(projection.spend.total)} of ${formatting.currencyCompact(projection.minimum.target)} · ${projection.daysRemaining} ${projection.daysRemaining === 1 ? 'day' : 'days'} left`;
    case 'near_cap':
    case 'capped':
      return projection.maximum.target === null
        ? undefined
        : `${formatting.currencyCompact(projection.progress.maximumProgressSpend)} of ${formatting.currencyCompact(projection.maximum.target)} · resets ${formatResetDate(projection.resetsOn)}`;
    case 'unconfigured':
      return projection.card.issuer === 'Unknown' ? undefined : projection.card.issuer;
    case 'earning':
    case 'open':
      return undefined;
  }
}

function AttentionCardRow({
  projection,
  formatting,
  onPress,
  showDivider,
}: {
  projection: CardDashboardProjection;
  formatting: CardFormatting;
  onPress: () => void;
  showDivider: boolean;
}) {
  const action = projection.status === 'capped'
    ? 'Cap reached · use another card'
    : attentionCopy(projection, formatting);
  const detail = attentionDetail({ projection, formatting });
  const actionColor = projection.status === 'capped' ? 'destructive' : 'attention';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[projection.card.name, action, detail].filter(Boolean).join(', ')}
      accessibilityHint="Opens card details"
      style={({ pressed }) => [
        styles.attentionRow,
        showDivider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowHeading} accessibilityElementsHidden>
        <Headline style={styles.rowTitle}>{projection.card.name}</Headline>
        <SymbolView
          name="chevron.right"
          size={11}
          tintColor={semanticColors.tertiaryLabel}
        />
      </View>
      <Headline color={actionColor} accessibilityElementsHidden>{action}</Headline>
      {detail ? <Footnote color="secondary" accessibilityElementsHidden>{detail}</Footnote> : null}
    </Pressable>
  );
}

function CardEarningsRow({
  projection,
  formatting,
  onPress,
  showDivider,
}: {
  projection: CardDashboardProjection;
  formatting: CardFormatting;
  onPress: () => void;
  showDivider: boolean;
}) {
  const isUnconfigured = projection.status === 'unconfigured';
  const rewardValue = isUnconfigured
    ? 'Not calculated'
    : projection.reward.type === 'cashback'
      ? formatting.currencyExact(projection.reward.amount)
      : `${formatting.number(projection.reward.amount)} miles`;
  const rewardDetail = isUnconfigured
    ? undefined
    : projection.reward.type === 'cashback'
      ? 'cashback'
      : `≈ ${formatting.currencyExact(projection.reward.dollars)}`;
  const cardContext = [
    projection.card.issuer === 'Unknown' ? undefined : projection.card.issuer,
    `${formatting.currencyCompact(projection.spend.total)} spent`,
    `resets ${formatResetDate(projection.resetsOn)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${projection.card.name}, ${rewardValue}${rewardDetail ? ` ${rewardDetail}` : ''}, ${cardContext}`}
      accessibilityHint="Opens card details"
      style={({ pressed }) => [
        styles.earningsRow,
        showDivider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.earningsCopy} accessibilityElementsHidden>
        <Headline numberOfLines={2}>{projection.card.name}</Headline>
        <Footnote color="secondary">{cardContext}</Footnote>
      </View>
      <View style={styles.earningsValue} accessibilityElementsHidden>
        <Headline color={isUnconfigured ? 'secondary' : 'primary'} style={styles.tabular}>
          {rewardValue}
        </Headline>
        {rewardDetail ? <Footnote color="secondary">{rewardDetail}</Footnote> : null}
      </View>
      <SymbolView
        name="chevron.right"
        size={11}
        tintColor={semanticColors.tertiaryLabel}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

function CategoryEarningsRow({
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
  const rewardValue = item.category.reward.type === 'cashback'
    ? formatting.currencyExact(item.category.reward.amount)
    : `${formatting.number(item.category.reward.amount)} miles`;
  const rewardDetail = item.category.reward.type === 'cashback'
    ? 'cashback'
    : `≈ ${formatting.currencyExact(item.category.reward.dollars)}`;
  const context = `${compactCardName(item.card.card.name)} · ${formatting.currencyCompact(item.category.spend.total)} spent`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.category.name}, ${item.card.card.name}, ${rewardValue} ${rewardDetail}, ${formatting.currencyCompact(item.category.spend.total)} spent`}
      accessibilityHint={`Opens the ${item.category.name} reward tier on ${item.card.card.name}`}
      style={({ pressed }) => [
        styles.earningsRow,
        showDivider && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name="flag.fill"
        size={15}
        tintColor={flagColor(item.category.flagColor)}
        style={styles.flagIcon}
        accessibilityElementsHidden
      />
      <View style={styles.earningsCopy} accessibilityElementsHidden>
        <Headline numberOfLines={2}>{item.category.name}</Headline>
        <Footnote color="secondary">{context}</Footnote>
      </View>
      <View style={styles.earningsValue} accessibilityElementsHidden>
        <Headline style={styles.tabular}>{rewardValue}</Headline>
        <Footnote color="secondary">{rewardDetail}</Footnote>
      </View>
      <SymbolView
        name="chevron.right"
        size={11}
        tintColor={semanticColors.tertiaryLabel}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const attentionPriority: Record<CardDashboardProjection['status'], number> = {
  capped: 0,
  near_cap: 1,
  building: 2,
  unconfigured: 3,
  earning: 4,
  open: 5,
};

export default function OverviewScreen() {
  const router = useRouter();
  const { state } = useStorage();
  const model = useRewardsDashboard();
  const formatting = useMemo(() => createCardFormatting(state.settings), [state.settings]);

  const visibleTotals = useMemo(
    () => model.visibleCards.reduce(
      (totals, projection) => {
        totals.value += projection.reward.dollars;
        totals.cashback += projection.reward.type === 'cashback' ? projection.reward.amount : 0;
        totals.miles += projection.reward.type === 'miles' ? projection.reward.amount : 0;
        totals.milesValue += projection.reward.type === 'miles' ? projection.reward.dollars : 0;
        return totals;
      },
      {
        value: 0,
        cashback: 0,
        miles: 0,
        milesValue: 0,
      },
    ),
    [model.visibleCards],
  );

  const rewardCategories = useMemo(
    () => collectRewardCategories(model.visibleCards),
    [model.visibleCards],
  );
  const categoryPreview = useMemo(
    () => rankRewardCategoryPreview(rewardCategories),
    [rewardCategories],
  );
  const tierAttentionPreview = useMemo(
    () => rankRewardCategoryPreview(rewardCategories, rewardCategories.length)
      .filter(({ category }) => (
        !category.excluded &&
        !category.blockedByCardMinimum &&
        (
          category.maximum.reached ||
          (category.maximum.progress ?? 0) >= 0.8 ||
          (category.minimum.target !== null && category.minimum.met === false)
        )
      ))
      .slice(0, 3),
    [rewardCategories],
  );
  const earnedCategoryPreview = useMemo(
    () => rankRewardCategoryEarnings(rewardCategories),
    [rewardCategories],
  );
  const attentionCards = useMemo(
    () => [...model.attentionCards].sort(
      (left, right) => attentionPriority[left.status] - attentionPriority[right.status],
    ),
    [model.attentionCards],
  );
  const nativeRewardSummary = [
    visibleTotals.cashback > 0
      ? `${formatting.currencyExact(visibleTotals.cashback)} cashback`
      : undefined,
    visibleTotals.miles > 0
      ? `${formatting.number(visibleTotals.miles)} miles ≈ ${formatting.currencyExact(visibleTotals.milesValue)}`
      : undefined,
  ].filter(Boolean).join(' · ');
  const attentionCount = attentionCards.length + tierAttentionPreview.length;

  const openCard = (id: string) => {
    router.push({ pathname: '/card/[id]', params: { id } });
  };

  const openRewardCategory = (id: string, categoryId: string) => {
    router.push({ pathname: '/card/[id]', params: { id, categoryId } });
  };

  const openRewardCategories = () => {
    router.push('/(tabs)/overview/categories');
  };

  const canShowDashboard = state.cards.length > 0 && model.visibleCards.length > 0;

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
      <LargeNavigationTitle style={styles.navigationTitle}>
        Overview
      </LargeNavigationTitle>
      {!state.pat || !state.selectedBudget.id ? (
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
      ) : !canShowDashboard ? (
        <EmptyState
          title="No cards on Overview"
          action={{
            label: 'View all cards',
            onPress: () => router.push('/(tabs)/cards'),
          }}
        />
      ) : (
        <>
          <View style={styles.hero}>
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`Estimated reward value ${formatting.currencyExact(visibleTotals.value)} across current card cycles${nativeRewardSummary ? `, ${nativeRewardSummary}` : ''}`}
            >
              <LargeTitle style={styles.heroValue} accessible={false}>
                {formatting.currencyExact(visibleTotals.value)}
              </LargeTitle>
              <Body color="secondary" accessible={false}>
                Estimated value · current card cycles
              </Body>
              {nativeRewardSummary ? (
                <Footnote color="secondary" style={styles.rewardBreakdown} accessible={false}>
                  {nativeRewardSummary}
                </Footnote>
              ) : null}
            </View>
            <SyncBadge
              state={model.syncState}
              label={model.syncLabel}
              onPress={model.canSync ? model.refresh : () => router.push('/settings')}
              accessibilityHint={model.canSync ? 'Refreshes rewards from YNAB' : 'Opens YNAB settings'}
            />
          </View>

          {attentionCount > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Needs attention" />
              <View style={styles.rows}>
                {attentionCards.map((projection, index) => (
                  <AttentionCardRow
                    key={projection.card.id}
                    projection={projection}
                    formatting={formatting}
                    onPress={() => openCard(projection.card.id)}
                    showDivider={index < attentionCards.length - 1 || tierAttentionPreview.length > 0}
                  />
                ))}
                {tierAttentionPreview.map((item, index) => (
                  <RewardCategoryRow
                    key={item.key}
                    item={item}
                    formatting={formatting}
                    onPress={() => openRewardCategory(item.card.card.id, item.category.id)}
                    showDivider={index < tierAttentionPreview.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionTitle title="Earned by card" />
            <View style={styles.rows}>
              {model.visibleCards.map((projection, index) => (
                <CardEarningsRow
                  key={projection.card.id}
                  projection={projection}
                  formatting={formatting}
                  onPress={() => openCard(projection.card.id)}
                  showDivider={index < model.visibleCards.length - 1}
                />
              ))}
            </View>
          </View>

          {categoryPreview.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle
                title={earnedCategoryPreview.length > 0 ? 'Earned by category' : 'Reward categories'}
                action={{
                  label: 'See all',
                  onPress: openRewardCategories,
                  accessibilityHint: 'Opens every reward category on Overview, grouped by card',
                }}
              />
              <View style={styles.rows}>
                {earnedCategoryPreview.length > 0
                  ? earnedCategoryPreview.map((item, index) => (
                      <CategoryEarningsRow
                        key={item.key}
                        item={item}
                        formatting={formatting}
                        onPress={() => openRewardCategory(item.card.card.id, item.category.id)}
                        showDivider={index < earnedCategoryPreview.length - 1}
                      />
                    ))
                  : categoryPreview.map((item, index) => (
                      <RewardCategoryRow
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
    gap: spacing.xxxl,
  },
  navigationTitle: {
    marginTop: spacing.sm,
  },
  hero: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  heroValue: {
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.2,
  },
  rewardBreakdown: {
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
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
  attentionRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowTitle: {
    flex: 1,
  },
  earningsRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  earningsCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  earningsValue: {
    flexShrink: 0,
    maxWidth: 120,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  flagIcon: {
    flexShrink: 0,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  pressed: {
    opacity: interaction.subtlePressedOpacity,
  },
});
