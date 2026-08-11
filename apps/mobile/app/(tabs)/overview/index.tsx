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
import { EmptyState, LargeNavigationTitle, SectionTitle } from '@/components/native';
import { Body, Footnote, Headline } from '@/components/ios';
import {
  createCardFormatting,
  flagColor,
  formatResetDate,
  type CardFormatting,
} from '@/features/cards/presentation';
import {
  orderCardProjections,
  useRewardsDashboard,
} from '@/features/cards/dashboard';
import {
  collectRewardCategories,
  rankCardUses,
  rankRewardCategoryPreview,
  type PortfolioRewardCategory,
  type RankedCardUse,
} from '@/features/cards/reward-categories';
import {
  CardGroupHeader,
  CardTile,
  StatusSummary,
  useDashboardPeriod,
  type HiddenCardEntry,
} from '@/features/overview';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

function isExpansionMap(
  value: unknown,
): value is Record<string, boolean> {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value),
  );
}

function isHiddenAt(cardId: string, hiddenUntil: string, referenceDate: Date): boolean {
  const expiry = new Date(hiddenUntil).getTime();
  return Boolean(cardId && Number.isFinite(expiry) && expiry > referenceDate.getTime());
}

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

function CardGroupSection({
  title,
  icon,
  iconColor,
  collapsed,
  count,
  onToggle,
  children,
}: {
  title: string;
  icon: 'percent' | 'chart.line.uptrend.xyaxis';
  iconColor: React.ComponentProps<typeof SymbolView>['tintColor'];
  collapsed: boolean;
  count: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <CardGroupHeader
        title={title}
        count={count}
        icon={icon}
        iconColor={iconColor}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed ? <View style={styles.tileStack}>{children}</View> : null}
    </View>
  );
}

export default function OverviewScreen() {
  const router = useRouter();
  const { state, actions } = useStorage();
  const period = useDashboardPeriod();
  const referenceDate = period.isToday ? undefined : period.referenceDate;
  const model = useRewardsDashboard(referenceDate);
  const formatting = useMemo(() => createCardFormatting(state.settings), [state.settings]);

  const orderedCards = useMemo(
    () => orderCardProjections(
      model.dashboard.cards,
      state.settings.cardOrdering?.all,
      state.settings.cardOrdering?.cashback,
      state.settings.cardOrdering?.miles,
    ),
    [model.dashboard.cards, state.settings.cardOrdering],
  );

  const activeHiddenEntries = useMemo(() => {
    if (!period.isToday) {
      return [];
    }
    return state.hiddenCards.filter((entry) =>
      isHiddenAt(entry.cardId, entry.hiddenUntil, period.referenceDate),
    );
  }, [period.isToday, period.referenceDate, state.hiddenCards]);

  const activeHiddenIds = useMemo(
    () => new Set(activeHiddenEntries.map((entry) => entry.cardId)),
    [activeHiddenEntries],
  );

  const dashboardCards = useMemo(
    () => orderedCards.filter(
      ({ card }) => card.featured !== false && !activeHiddenIds.has(card.id),
    ),
    [activeHiddenIds, orderedCards],
  );

  const configuredCards = useMemo(
    () => dashboardCards.filter((projection) => projection.status !== 'unconfigured'),
    [dashboardCards],
  );
  const setupCards = useMemo(
    () => dashboardCards.filter((projection) => projection.status === 'unconfigured'),
    [dashboardCards],
  );
  const cashbackCards = useMemo(
    () => configuredCards.filter(({ card }) => card.type === 'cashback'),
    [configuredCards],
  );
  const milesCards = useMemo(
    () => configuredCards.filter(({ card }) => card.type === 'miles'),
    [configuredCards],
  );
  const earnedDollars = useMemo(
    () => configuredCards.reduce((sum, projection) => sum + projection.reward.dollars, 0),
    [configuredCards],
  );
  const nonCappedCards = useMemo(
    () => model.visibleCards.filter((projection) => projection.status !== 'capped'),
    [model.visibleCards],
  );
  const cardUses = useMemo(
    () => rankCardUses(nonCappedCards, state.settings),
    [nonCappedCards, state.settings],
  );
  const rewardCategories = useMemo(
    () => collectRewardCategories(nonCappedCards),
    [nonCappedCards],
  );
  const categoryPreview = useMemo(
    () => rankRewardCategoryPreview(rewardCategories),
    [rewardCategories],
  );

  const groupCollapsed = state.settings.collapsedCardGroups ?? {};
  const subcategoryExpansion = state.settings.summaryViewSubcategoriesExpanded;

  const hiddenChips: HiddenCardEntry[] = useMemo(
    () => activeHiddenEntries.map((entry) => {
      const card = state.cards.find((candidate) => candidate.id === entry.cardId);
      return {
        cardId: entry.cardId,
        name: card ? compactCardName(card.name) : 'Card',
        hiddenUntil: entry.hiddenUntil,
      };
    }),
    [activeHiddenEntries, state.cards],
  );

  const syncActionLabel = model.canSync
    ? `${model.syncLabel} — Retry`
    : `${model.syncLabel} — Review settings`;
  const connected = Boolean(state.pat && state.selectedBudget.id);
  const hasDashboardContent = dashboardCards.length > 0;

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

  const toggleGroup = (type: 'cashback' | 'miles') => {
    void actions.setSettings({
      collapsedCardGroups: {
        ...groupCollapsed,
        [type]: !groupCollapsed[type],
      },
    });
  };

  const toggleSubcategories = (cardId: string) => {
    const currentValue = isExpansionMap(subcategoryExpansion)
      ? subcategoryExpansion[cardId] ?? false
      : Boolean(subcategoryExpansion);
    const nextValue = !currentValue;
    const nextSetting: Record<string, boolean> = isExpansionMap(subcategoryExpansion)
      ? { ...subcategoryExpansion, [cardId]: nextValue }
      : { [cardId]: nextValue };
    void actions.setSettings({ summaryViewSubcategoriesExpanded: nextSetting });
  };

  const isSubcategoryExpanded = (cardId: string): boolean =>
    isExpansionMap(subcategoryExpansion)
      ? subcategoryExpansion[cardId] ?? false
      : Boolean(subcategoryExpansion);

  const hideCard = async (cardId: string, hiddenUntil: string) => {
    const next = [
      ...state.hiddenCards.filter((entry) => entry.cardId !== cardId),
      { cardId, hiddenUntil, reason: 'maximum_spend_reached' as const },
    ];
    await actions.setHiddenCards(next);
  };

  const unhideCard = async (cardId: string) => {
    await actions.setHiddenCards(
      state.hiddenCards.filter((entry) => entry.cardId !== cardId),
    );
  };

  const unhideAll = async () => {
    await actions.setHiddenCards(
      state.hiddenCards.filter((entry) =>
        !isHiddenAt(entry.cardId, entry.hiddenUntil, period.referenceDate)),
    );
  };

  const periodTrigger = (
    <Pressable
      onPress={() => router.push('/(tabs)/overview/period')}
      accessibilityRole="button"
      accessibilityLabel={`Dashboard period, ${period.isToday ? 'today' : period.asOfLabel}`}
      accessibilityHint="Changes the dashboard period"
      style={({ pressed }) => [styles.periodPill, pressed && styles.pressed]}
    >
      <SymbolView
        name={period.isToday ? 'calendar' : 'clock.arrow.circlepath'}
        size={13}
        tintColor={semanticColors.action}
        accessibilityElementsHidden
      />
      <Footnote color={period.isToday ? 'action' : 'primary'} style={styles.periodLabel} accessible={false}>
        {period.triggerLabel}
      </Footnote>
      <SymbolView
        name="chevron.down"
        size={9}
        tintColor={semanticColors.tertiaryLabel}
        accessibilityElementsHidden
      />
    </Pressable>
  );

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
        <View style={styles.topRow}>
          {periodTrigger}
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
      ) : !hasDashboardContent && cardUses.length === 0 ? (
        activeHiddenEntries.length > 0 ? (
          <EmptyState
            title="All cards hidden"
            message="Cards stay hidden until their next cycle resets."
            action={{
              label: 'Show hidden cards now',
              onPress: () => void unhideAll(),
              accessibilityHint: 'Restores every temporarily hidden card to Overview',
            }}
          />
        ) : (
          <EmptyState
            title="No cards to use right now"
            action={{
              label: 'View cards',
              onPress: () => router.push('/(tabs)/cards'),
              accessibilityHint: 'Opens all cards',
            }}
          />
        )
      ) : (
        <>
          {configuredCards.length > 0 ? (
            <StatusSummary
              projections={configuredCards}
              earnedDollars={earnedDollars}
              formatting={formatting}
              hiddenCards={period.isToday ? hiddenChips : undefined}
              onUnhideCard={period.isToday ? (cardId) => void unhideCard(cardId) : undefined}
              onUnhideAll={period.isToday ? () => void unhideAll() : undefined}
            />
          ) : null}

          <CardGroupSection
            title="Cashback Cards"
            icon="percent"
            iconColor={semanticColors.positive}
            collapsed={groupCollapsed.cashback ?? false}
            count={cashbackCards.length}
            onToggle={() => toggleGroup('cashback')}
          >
            {cashbackCards.map((projection) => (
              <CardTile
                key={projection.card.id}
                projection={projection}
                formatting={formatting}
                allowHideCard={period.isToday}
                isSubcategoryExpanded={isSubcategoryExpanded(projection.card.id)}
                onToggleSubcategories={() => toggleSubcategories(projection.card.id)}
                onHideCard={(cardId, hiddenUntil) => void hideCard(cardId, hiddenUntil)}
                onOpen={() => openCard(projection.card.id)}
              />
            ))}
          </CardGroupSection>

          <CardGroupSection
            title="Miles Cards"
            icon="chart.line.uptrend.xyaxis"
            iconColor={semanticColors.systemBlue}
            collapsed={groupCollapsed.miles ?? false}
            count={milesCards.length}
            onToggle={() => toggleGroup('miles')}
          >
            {milesCards.map((projection) => (
              <CardTile
                key={projection.card.id}
                projection={projection}
                formatting={formatting}
                allowHideCard={period.isToday}
                isSubcategoryExpanded={isSubcategoryExpanded(projection.card.id)}
                onToggleSubcategories={() => toggleSubcategories(projection.card.id)}
                onHideCard={(cardId, hiddenUntil) => void hideCard(cardId, hiddenUntil)}
                onOpen={() => openCard(projection.card.id)}
              />
            ))}
          </CardGroupSection>

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
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  periodPill: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  periodLabel: {
    fontWeight: '600',
  },
  syncAction: {
    minHeight: nativeMetrics.minimumTouchTarget,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  section: {
    gap: spacing.md,
  },
  tileStack: {
    gap: spacing.md,
  },
  rows: {
    marginHorizontal: -spacing.md,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    overflow: 'hidden',
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
    opacity: interaction.pressedOpacity,
  },
});
