import React, { useCallback, useMemo } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  EmptyState,
  SyncBadge,
} from '@/components/native';
import { Footnote, Headline } from '@/components/ios';
import { useStorage } from '@/contexts/StorageContext';
import {
  TransactionRow,
  groupActivityByDate,
  useActivityModel,
  type ActivitySection,
} from '@/features/activity';
import { useRewardsDashboard } from '@/features/cards/dashboard';
import { semanticColors } from '@/theme';
import { nativeMetrics, spacing } from '@/theme/tokens';
import type { TransactionProjection } from '@ynab-counter/app-core/rewards-engine';

function parameterValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function CardTransactionsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const cardId = parameterValue(params.id);
  const router = useRouter();
  const { state } = useStorage();
  const model = useRewardsDashboard();

  const card = useMemo(
    () => state.cards.find((candidate) => candidate.id === cardId),
    [cardId, state.cards],
  );
  const accountId = card?.ynabAccountId;
  const activity = useActivityModel('', accountId);

  const cardTransactions = useMemo(() => {
    if (!card || !accountId) {
      return [];
    }
    return activity.transactions;
  }, [accountId, activity.transactions, card]);

  const sections = useMemo(
    () => groupActivityByDate(cardTransactions),
    [cardTransactions],
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

  const isCardRefreshing = model.isRefreshing;
  const refresh = model.canSync
    ? model.refresh
    : () => router.push('/settings');

  if (!card || !accountId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Transactions' }} />
        <View style={[styles.screen, styles.missingCard]}>
          <EmptyState
            title="Card not found"
            message="This card is no longer available."
            action={{
              label: 'Back to cards',
              onPress: () => router.replace('/(tabs)/cards'),
              accessibilityHint: 'Returns to the cards list',
            }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: card.name,
        }}
      />
      <SectionList<TransactionProjection, ActivitySection>
        style={styles.screen}
        sections={sections}
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
            <View style={styles.orientation}>
              <Footnote color="secondary">
                {cardTransactions.length} saved {cardTransactions.length === 1 ? 'transaction' : 'transactions'}
              </Footnote>
              <SyncBadge
                state={model.syncState}
                label={model.syncLabel}
                onPress={refresh}
                accessibilityHint={model.canSync
                  ? 'Refreshes transactions from YNAB'
                  : 'Opens YNAB connection settings'}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <EmptyState
            compact
            title="No saved transactions yet"
            message="Pull down to fetch transactions for this card."
            action={model.canSync
              ? {
                  label: 'Refresh transactions',
                  onPress: model.refresh,
                  accessibilityHint: 'Fetches transactions from YNAB',
                }
              : undefined}
          />
        )}
        refreshControl={(
          <RefreshControl
            refreshing={isCardRefreshing}
            onRefresh={model.refresh}
            enabled={model.canSync}
            tintColor={semanticColors.action}
            accessibilityLabel="Refresh card transactions"
          />
        )}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        contentContainerStyle={[
          styles.content,
          sections.length === 0 && styles.emptyContent,
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  missingCard: {
    justifyContent: 'center',
    paddingHorizontal: nativeMetrics.screenGutter,
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
