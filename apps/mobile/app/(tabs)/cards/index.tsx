import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useStorage } from '@/contexts/StorageContext';
import {
  CardStatusRow,
  EmptyState,
  LargeNavigationTitle,
  SectionTitle,
  SyncBadge,
} from '@/components/native';
import { Headline } from '@/components/ios';
import {
  orderCardProjections,
  useRewardsDashboard,
} from '@/features/cards/dashboard';
import {
  countActiveFlagRules,
  createCardFormatting,
  formatReward,
  formatThresholdSummary,
  isCardConfigured,
  isPromotionalPeriodActive,
  primaryProgress,
  statusPresentation,
} from '@/features/cards/presentation';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

function ManagementRow({
  projection,
  onPress,
  formatCurrency,
  rewardValue,
  context,
  showDivider,
}: {
  projection: CardDashboardProjection;
  onPress: () => void;
  formatCurrency: (value: number) => string;
  rewardValue: string;
  context: string;
  showDivider: boolean;
}) {
  const configured = isCardConfigured(projection.card);
  const progress = primaryProgress(projection);

  return (
    <CardStatusRow
      name={projection.card.name}
      issuer={projection.card.issuer === 'Unknown' ? undefined : projection.card.issuer}
      periodLabel={context}
      rewardValue={rewardValue}
      rewardLabel="This period"
      spend={progress.spend}
      formatValue={formatCurrency}
      minimumSpend={progress.minimum}
      maximumSpend={progress.maximum}
      status={configured
        ? statusPresentation(projection.status)
        : { label: 'Needs setup', tone: 'attention' }}
      promo={isPromotionalPeriodActive(projection.card)}
      ruleCount={countActiveFlagRules(projection.card)}
      onPress={onPress}
      showDivider={showDivider}
    />
  );
}

export default function CardsScreen() {
  const router = useRouter();
  const { state } = useStorage();
  const model = useRewardsDashboard();
  const [query, setQuery] = useState('');
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
  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return orderedCards;
    }
    return orderedCards.filter(({ card }) => {
      const accountName = model.cacheEntry?.accounts.find(
        (account) => account.id === card.ynabAccountId,
      )?.name;
      return [card.name, card.issuer, accountName, card.type]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [model.cacheEntry?.accounts, orderedCards, query]);
  const cashbackCards = filteredCards.filter(({ card }) => card.type === 'cashback');
  const milesCards = filteredCards.filter(({ card }) => card.type === 'miles');

  const openCard = (id: string) => {
    router.push({ pathname: '/card/[id]', params: { id } });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustsScrollIndicatorInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={(
        <RefreshControl
          refreshing={model.isRefreshing}
          onRefresh={model.refresh}
          enabled={model.canSync}
          tintColor={semanticColors.action}
          accessibilityLabel="Refresh cards from YNAB"
        />
      )}
    >
      <LargeNavigationTitle>Cards</LargeNavigationTitle>
      <View style={styles.topMatter}>
        <View style={styles.search}>
          <SymbolView
            name="magnifyingglass"
            size={17}
            tintColor={semanticColors.secondaryLabel}
            fallback={<Text style={styles.searchFallback}>⌕</Text>}
            accessibilityElementsHidden
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search cards"
            placeholderTextColor={semanticColors.tertiaryLabel}
            clearButtonMode="while-editing"
            returnKeyType="search"
            accessibilityLabel="Search cards"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.syncRow}>
          <SyncBadge
            state={model.syncState}
            label={model.syncLabel}
            onPress={model.canSync ? model.refresh : () => router.push('/settings')}
            accessibilityHint={model.canSync ? 'Refreshes cards from YNAB' : 'Opens YNAB settings'}
          />
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Manage YNAB accounts"
            accessibilityHint="Choose which YNAB credit-card accounts are tracked"
            style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
          >
            <SymbolView
              name="plus"
              size={15}
              weight="semibold"
              tintColor={semanticColors.action}
              accessibilityElementsHidden
            />
            <Headline color="action" style={styles.manageLabel}>
              Manage accounts
            </Headline>
          </Pressable>
        </View>
      </View>

      {state.cards.length === 0 ? (
        <EmptyState
          compact
          title="No tracked cards"
          action={{
            label: 'Manage YNAB accounts',
            onPress: () => router.push('/settings'),
          }}
        />
      ) : filteredCards.length === 0 ? (
        <EmptyState
          compact
          title="No matching cards"
          message={`Nothing matches “${query.trim()}”.`}
          action={{ label: 'Clear search', onPress: () => setQuery('') }}
        />
      ) : (
        <>
          {cashbackCards.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle
                title="Cashback"
                subtitle={`${cashbackCards.length} ${cashbackCards.length === 1 ? 'card' : 'cards'}`}
              />
              <View style={styles.rows}>
                {cashbackCards.map((projection, index) => (
                  <ManagementRow
                    key={projection.card.id}
                    projection={projection}
                    onPress={() => openCard(projection.card.id)}
                    formatCurrency={formatting.currencyCompact}
                    rewardValue={formatReward(projection, formatting)}
                    context={formatThresholdSummary(projection.card, formatting)}
                    showDivider={index < cashbackCards.length - 1}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {milesCards.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle
                title="Miles"
                subtitle={`${milesCards.length} ${milesCards.length === 1 ? 'card' : 'cards'}`}
              />
              <View style={styles.rows}>
                {milesCards.map((projection, index) => (
                  <ManagementRow
                    key={projection.card.id}
                    projection={projection}
                    onPress={() => openCard(projection.card.id)}
                    formatCurrency={formatting.currencyCompact}
                    rewardValue={formatReward(projection, formatting)}
                    context={formatThresholdSummary(projection.card, formatting)}
                    showDivider={index < milesCards.length - 1}
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
  topMatter: {
    gap: spacing.md,
  },
  search: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.medium,
    backgroundColor: semanticColors.secondarySystemFill,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 0,
    color: semanticColors.label,
    fontSize: 17,
  },
  searchFallback: {
    color: semanticColors.secondaryLabel,
    fontSize: 18,
  },
  syncRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
  },
  manageButton: {
    minHeight: nativeMetrics.minimumTouchTarget,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xs,
  },
  manageLabel: {
    fontSize: 15,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  section: {
    gap: spacing.md,
  },
  rows: {
    marginHorizontal: -spacing.md,
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
});
