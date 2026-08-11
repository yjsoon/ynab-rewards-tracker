import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import {
  EmptyState,
  LargeNavigationTitle,
  SyncBadge,
} from '@/components/native';
import { Footnote, Headline } from '@/components/ios';
import { useStorage } from '@/contexts/StorageContext';
import {
  TransactionRow,
  useActivityModel,
  type ActivitySection,
} from '@/features/activity';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { TransactionProjection } from '@ynab-counter/app-core/rewards-engine';

function AccountFilterChips({
  accounts,
  selectedAccountId,
  onSelect,
}: {
  accounts: { id: string; name: string }[];
  selectedAccountId?: string;
  onSelect: (accountId: string | undefined) => void;
}) {
  const chips = useMemo(() => {
    const seen = new Set<string>();
    const unique = accounts.filter((account) => {
      if (seen.has(account.id)) {
        return false;
      }
      seen.add(account.id);
      return true;
    });
    return [{ id: undefined, name: 'All accounts' }, ...unique] as {
      id?: string;
      name: string;
    }[];
  }, [accounts]);

  if (chips.length <= 1) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.filterChips}
      style={styles.filterScroll}
      accessibilityRole="none"
    >
      {chips.map((chip) => {
        const selected = chip.id === selectedAccountId;
        return (
          <Pressable
            key={chip.id ?? 'all'}
            onPress={() => onSelect(chip.id)}
            accessibilityRole="button"
            accessibilityLabel={chip.name}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.filterChip,
              selected && styles.filterChipSelected,
              pressed && styles.filterChipPressed,
            ]}
          >
            <Footnote
              color={selected ? 'primary' : 'secondary'}
              style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}
              accessible={false}
            >
              {chip.name}
            </Footnote>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const { state } = useStorage();
  const [query, setQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const model = useActivityModel(query, selectedAccountId);
  const accounts = useMemo(
    () => model.cacheEntry?.accounts ?? [],
    [model.cacheEntry],
  );

  const openTransaction = useCallback((id: string) => {
    router.push({
      pathname: '/(tabs)/activity/[id]',
      params: { id },
    });
  }, [router]);

  const renderTransaction = useCallback(({
    item,
    index,
    section,
  }: {
    item: TransactionProjection;
    index: number;
    section: ActivitySection;
  }) => {
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;
    const position = isFirst && isLast
      ? 'only'
      : isFirst
        ? 'first'
        : isLast
          ? 'last'
          : 'middle';

    return (
      <TransactionRow
        projection={item}
        settings={state.settings}
        position={position}
        onPress={() => openTransaction(item.transaction.id)}
      />
    );
  }, [openTransaction, state.settings]);

  const isSearching = query.trim().length > 0;
  const resultCount = model.transactions.length;
  const resultCopy = isSearching
    ? `${resultCount} ${resultCount === 1 ? 'match' : 'matches'}`
    : `${resultCount} ${resultCount === 1 ? 'transaction' : 'transactions'}`;

  return (
    <SectionList<TransactionProjection, ActivitySection>
        style={styles.screen}
        sections={model.sections}
        keyExtractor={(item) => item.transaction.id}
        renderItem={renderTransaction}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Headline accessibilityRole="header">{section.title}</Headline>
            <Footnote color="secondary">
              {section.data.length} {section.data.length === 1 ? 'transaction' : 'transactions'}
            </Footnote>
          </View>
        )}
        renderSectionFooter={() => <View style={styles.sectionFooter} />}
        ListHeaderComponent={(
          <View style={styles.topMatter}>
            <LargeNavigationTitle>Activity</LargeNavigationTitle>
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
                placeholder="Payee, category or card"
                placeholderTextColor={semanticColors.tertiaryLabel}
                clearButtonMode="while-editing"
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search activity"
                style={styles.searchInput}
              />
            </View>
            <AccountFilterChips
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelect={setSelectedAccountId}
            />
            <View style={styles.orientation}>
              <Footnote color="secondary">{resultCopy}</Footnote>
              <SyncBadge
                state={model.syncBadgeState}
                label={model.freshnessLabel}
                onPress={model.canSync ? model.refresh : () => router.push('/settings')}
                accessibilityHint={model.canSync
                  ? 'Refreshes activity from YNAB'
                  : 'Opens YNAB connection settings'}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <EmptyState
            compact
            icon={(
              <SymbolView
                name="clock.arrow.circlepath"
                size={68}
                tintColor={semanticColors.action}
                accessibilityElementsHidden
              />
            )}
            title={isSearching
              ? 'No matching activity'
              : !model.isHydrated
                ? 'Loading activity'
                : model.hasConnection
                  ? 'No saved activity yet'
                  : 'Connect YNAB to see activity'}
            message={isSearching
              ? `Nothing matches “${query.trim()}”.`
              : !model.isHydrated
                ? 'Your saved transactions will appear in a moment.'
                : model.hasConnection
                  ? 'Pull down to fetch transactions for your tracked cards.'
                  : 'Tracked card transactions and their estimated rewards will appear here.'}
            action={isSearching
              ? undefined
              : model.hasConnection
                ? {
                    label: 'Refresh activity',
                    onPress: model.refresh,
                    accessibilityHint: 'Fetches transactions from YNAB',
                  }
                : {
                    label: 'Connect YNAB',
                    onPress: () => router.push('/settings'),
                    accessibilityHint: 'Opens YNAB connection settings',
                  }}
          />
        )}
        refreshControl={(
          <RefreshControl
            refreshing={model.isRefreshing}
            onRefresh={model.refresh}
            enabled={model.canSync}
            tintColor={semanticColors.action}
            accessibilityLabel="Refresh activity from YNAB"
          />
        )}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustContentInsets
        automaticallyAdjustsScrollIndicatorInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        contentContainerStyle={[
          styles.content,
          model.sections.length === 0 && styles.emptyContent,
        ]}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  emptyContent: {
    flexGrow: 1,
  },
  topMatter: {
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  search: {
    minHeight: nativeMetrics.minimumTouchTarget,
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
    minHeight: nativeMetrics.minimumTouchTarget,
    paddingVertical: 0,
    color: semanticColors.label,
    fontSize: 17,
  },
  searchFallback: {
    color: semanticColors.secondaryLabel,
    fontSize: 18,
  },
  filterScroll: {
    flexGrow: 0,
    marginHorizontal: -nativeMetrics.screenGutter,
  },
  filterChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: nativeMetrics.screenGutter,
  },
  filterChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  filterChipSelected: {
    backgroundColor: semanticColors.actionTint,
  },
  filterChipPressed: {
    opacity: interaction.pressedOpacity,
  },
  filterChipLabel: {
    fontWeight: '500',
  },
  filterChipLabelSelected: {
    color: semanticColors.action,
  },
  orientation: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionHeader: {
    minHeight: nativeMetrics.minimumTouchTarget,
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  sectionFooter: {
    height: spacing.sm,
  },
});
