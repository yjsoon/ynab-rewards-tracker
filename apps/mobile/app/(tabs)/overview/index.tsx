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
import { EmptyState } from '@/components/native';
import { Footnote } from '@/components/ios';
import { createCardFormatting } from '@/features/cards/presentation';
import {
  orderCardProjections,
  useRewardsDashboard,
} from '@/features/cards/dashboard';
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
  const groupByType = state.settings.groupCardsByType ?? true;

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

  const featuredCards = useMemo(
    () => orderedCards.filter(
      ({ card }) => card.featured !== false && !activeHiddenIds.has(card.id),
    ),
    [activeHiddenIds, orderedCards],
  );
  const cashbackCards = useMemo(
    () => featuredCards.filter(({ card }) => card.type === 'cashback'),
    [featuredCards],
  );
  const milesCards = useMemo(
    () => featuredCards.filter(({ card }) => card.type === 'miles'),
    [featuredCards],
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

  const connected = Boolean(state.pat && state.selectedBudget.id);
  const needsSyncAttention = connected
    && state.cards.length > 0
    && (model.syncState === 'offline' || model.syncState === 'attention');
  const syncActionLabel = model.canSync
    ? `${model.syncLabel} — Retry`
    : `${model.syncLabel} — Review settings`;
  const hasDashboardContent = featuredCards.length > 0;

  const openCard = (id: string) => {
    router.push({ pathname: '/card/[id]', params: { id } });
  };

  const editCard = (id: string) => {
    router.push({ pathname: '/card/[id]/edit', params: { id } });
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
    const nextSetting: Record<string, boolean> = isExpansionMap(subcategoryExpansion)
      ? { ...subcategoryExpansion, [cardId]: !currentValue }
      : { [cardId]: !currentValue };
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

  const renderTile = (projection: CardDashboardProjection) => (
    <CardTile
      key={projection.card.id}
      projection={projection}
      formatting={formatting}
      referenceDate={period.referenceDate}
      allowHideCard={period.isToday}
      isSubcategoryExpanded={isSubcategoryExpanded(projection.card.id)}
      onToggleSubcategories={() => toggleSubcategories(projection.card.id)}
      onHideCard={(cardId, hiddenUntil) => void hideCard(cardId, hiddenUntil)}
      onOpen={() => openCard(projection.card.id)}
      onEdit={() => editCard(projection.card.id)}
    />
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
      <View style={styles.topRow}>
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
        {needsSyncAttention ? (
          <Pressable
            onPress={model.canSync ? model.refresh : () => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={syncActionLabel}
            accessibilityHint={model.canSync
              ? 'Retries syncing rewards from YNAB'
              : 'Opens YNAB connection settings'}
            style={({ pressed }) => [styles.syncAction, pressed && styles.pressed]}
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
      ) : !hasDashboardContent ? (
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
          <StatusSummary
            projections={featuredCards}
            formatting={formatting}
            hiddenCards={period.isToday ? hiddenChips : undefined}
            onUnhideCard={period.isToday ? (cardId) => void unhideCard(cardId) : undefined}
            onUnhideAll={period.isToday ? () => void unhideAll() : undefined}
          />

          {groupByType ? (
            <>
              <CardGroupSection
                title="Cashback Cards"
                icon="percent"
                iconColor={semanticColors.positive}
                collapsed={groupCollapsed.cashback ?? false}
                count={cashbackCards.length}
                onToggle={() => toggleGroup('cashback')}
              >
                {cashbackCards.map(renderTile)}
              </CardGroupSection>
              <CardGroupSection
                title="Miles Cards"
                icon="chart.line.uptrend.xyaxis"
                iconColor={semanticColors.systemBlue}
                collapsed={groupCollapsed.miles ?? false}
                count={milesCards.length}
                onToggle={() => toggleGroup('miles')}
              >
                {milesCards.map(renderTile)}
              </CardGroupSection>
            </>
          ) : (
            <View style={styles.tileStack}>
              {featuredCards.map(renderTile)}
            </View>
          )}
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
    gap: spacing.xl,
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
    gap: spacing.sm,
  },
  tileStack: {
    gap: spacing.md,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
