import React, { useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useStorage } from '@/contexts/StorageContext';
import {
  CardStatusRow,
  EmptyState,
  LargeNavigationTitle,
  MetricValue,
  SectionTitle,
  SyncBadge,
} from '@/components/native';
import {
  Body,
  LargeTitle,
} from '@/components/ios';
import {
  createCardFormatting,
  formatDaysRemaining,
  formatPeriod,
  formatReward,
  primaryProgress,
  statusPresentation,
  attentionCopy,
} from '@/features/cards/presentation';
import { useRewardsDashboard } from '@/features/cards/dashboard';
import { RewardCategorySummary } from '@/features/cards/RewardCategoryBreakdown';
import {
  collectRewardCategories,
  rankRewardCategoryPreview,
} from '@/features/cards/reward-categories';
import { semanticColors } from '@/theme';
import { nativeMetrics, spacing } from '@/theme/tokens';
import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

function CardProjectionRow({
  projection,
  formatCurrency,
  rewardValue,
  context,
  onPress,
  showDivider,
}: {
  projection: CardDashboardProjection;
  formatCurrency: (value: number) => string;
  rewardValue: string;
  context: string;
  onPress: () => void;
  showDivider: boolean;
}) {
  const blockDetail = projection.blockInfo
    ? projection.blockInfo.uncountedEligibleSpend > 0
      ? `${projection.blockInfo.sizes.map((size) => formatCurrency(size)).join('/')} blocks · ${formatCurrency(projection.blockInfo.uncountedEligibleSpend)} not counted`
      : `${projection.blockInfo.sizes.map((size) => formatCurrency(size)).join('/')} blocks`
    : undefined;
  const periodLabel = [context, blockDetail].filter(Boolean).join(' · ');
  const progress = primaryProgress(projection);

  return (
    <CardStatusRow
      name={projection.card.name}
      issuer={projection.card.issuer === 'Unknown' ? undefined : projection.card.issuer}
      periodLabel={periodLabel}
      rewardValue={rewardValue}
      rewardLabel={projection.card.type === 'miles' ? 'Miles earned' : 'Cashback earned'}
      spend={progress.spend}
      formatValue={formatCurrency}
      minimumSpend={progress.minimum}
      maximumSpend={progress.maximum}
      status={statusPresentation(projection.status)}
      onPress={onPress}
      showDivider={showDivider}
    />
  );
}

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
        totals.spend += projection.spend.total;
        totals.counts[projection.status] += 1;
        return totals;
      },
      {
        value: 0,
        cashback: 0,
        miles: 0,
        milesValue: 0,
        spend: 0,
        counts: {
          unconfigured: 0,
          building: 0,
          earning: 0,
          near_cap: 0,
          capped: 0,
          open: 0,
        } satisfies Record<CardDashboardProjection['status'], number>,
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
            <SyncBadge
              state={model.syncState}
              label={model.syncLabel}
              onPress={model.canSync ? model.refresh : () => router.push('/settings')}
              accessibilityHint={model.canSync ? 'Refreshes rewards from YNAB' : 'Opens YNAB settings'}
            />

            <View accessible accessibilityRole="summary" accessibilityLabel={`Estimated reward value ${formatting.currencyExact(visibleTotals.value)}`}>
              <LargeTitle style={styles.heroValue} accessible={false}>
                {formatting.currencyExact(visibleTotals.value)}
              </LargeTitle>
              <Body color="secondary" accessible={false}>
                Estimated reward value
              </Body>
            </View>

            <View style={styles.nativeTotals}>
              <MetricValue
                label="Cashback"
                value={formatting.currencyExact(visibleTotals.cashback)}
                size="compact"
              />
              <View style={styles.metricDivider} />
              <MetricValue
                label="Miles"
                value={formatting.number(visibleTotals.miles)}
                detail={`≈ ${formatting.currencyExact(visibleTotals.milesValue)}`}
                size="compact"
              />
              <View style={styles.metricDivider} />
              <MetricValue
                label="Spend tracked"
                value={formatting.currencyCompact(visibleTotals.spend)}
                size="compact"
              />
            </View>

            <RewardCategorySummary
              categories={rewardCategories}
              preview={categoryPreview}
              formatting={formatting}
              setupCount={visibleTotals.counts.unconfigured}
              onSeeAll={openRewardCategories}
              onOpenCard={openRewardCategory}
              onReviewCards={() => router.push('/(tabs)/cards')}
            />
          </View>

          {model.attentionCards.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle
                title="Needs attention"
              />
              <View style={styles.rows}>
                {model.attentionCards.map((projection, index) => (
                  <CardProjectionRow
                    key={projection.card.id}
                    projection={projection}
                    rewardValue={formatReward(projection, formatting)}
                    formatCurrency={formatting.currencyCompact}
                    context={attentionCopy(projection, formatting)}
                    onPress={() => openCard(projection.card.id)}
                    showDivider={index < model.attentionCards.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {model.trackingCards.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle
                title={model.attentionCards.length > 0 ? 'On track' : 'Your cards'}
                subtitle={`${model.trackingCards.length} ${model.trackingCards.length === 1 ? 'card' : 'cards'} on Overview`}
                action={{
                  label: 'All cards',
                  onPress: () => router.push('/(tabs)/cards'),
                  accessibilityHint: 'Opens card management',
                }}
              />
              <View style={styles.rows}>
                {model.trackingCards.map((projection, index) => (
                  <CardProjectionRow
                    key={projection.card.id}
                    projection={projection}
                    rewardValue={formatReward(projection, formatting)}
                    formatCurrency={formatting.currencyCompact}
                    context={`${formatPeriod(projection.period)} · ${formatDaysRemaining(projection.daysRemaining, projection.resetsOn)}`}
                    onPress={() => openCard(projection.card.id)}
                    showDivider={index < model.trackingCards.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {model.trackingCards.length === 0 ? (
            <SectionTitle
              title="Card management"
              action={{ label: 'All cards', onPress: () => router.push('/(tabs)/cards') }}
            />
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
    gap: spacing.xl,
  },
  heroValue: {
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.2,
  },
  nativeTotals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    columnGap: spacing.lg,
    rowGap: spacing.lg,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    minHeight: 42,
    backgroundColor: semanticColors.separator,
  },
  section: {
    gap: spacing.md,
  },
  rows: {
    marginHorizontal: -spacing.md,
    borderRadius: 16,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    overflow: 'hidden',
  },
});
