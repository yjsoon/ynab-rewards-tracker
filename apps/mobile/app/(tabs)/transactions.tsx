import React, { useMemo } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useHaptics } from '@/hooks/useHaptics';
import { useStorage } from '@/contexts/StorageContext';
import { findBestDashboardEntry, buildAccountsMap } from '@/lib/dashboardCache';
import { Card, ListItem, Headline, Footnote } from '@/components/ios';
import { semanticColors } from '@/theme/semanticColors';

type DisplayTransaction = {
  id: string;
  date: string;
  amount: number;
  payeeName: string;
  categoryName: string | null;
  accountName?: string;
};

type TransactionsContent = {
  transactions: DisplayTransaction[];
  isLoading: boolean;
  statusMessage: string;
  infoMessage?: string;
  lastUpdated?: string;
};

function useTransactionsContent(): TransactionsContent {
  const { state, status } = useStorage();

  return useMemo(() => {
    if (!status.isHydrated) {
      return {
        transactions: [],
        isLoading: true,
        statusMessage: 'Loading transactions…',
      };
    }

    const entry = findBestDashboardEntry(
      state.cachedData?.dashboardTransactions,
      state.selectedBudget.id,
      state.trackedAccountIds,
    );

    if (!entry) {
      if (state.connectionStatus !== 'connected' || !state.pat) {
        return {
          transactions: [],
          isLoading: false,
          statusMessage: 'Complete setup to see transactions.',
          infoMessage: 'Connect your YNAB account to view transaction history.',
        };
      }

      if (state.trackedAccountIds.length === 0) {
        return {
          transactions: [],
          isLoading: false,
          statusMessage: 'Select at least one credit card account in Settings to see activity.',
        };
      }

      return {
        transactions: [],
        isLoading: false,
        statusMessage: 'No cached transactions yet. Pull down on Home to sync from YNAB.',
      };
    }

    const accountsMap = buildAccountsMap(entry);
    const trackedSet = new Set(state.trackedAccountIds);
    const filtered = entry.transactions
      .filter((txn) => (trackedSet.size === 0 ? true : trackedSet.has(txn.account_id)))
      .filter((txn) => txn.amount < 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const mapped: DisplayTransaction[] = filtered.map((txn) => ({
      id: txn.id,
      date: txn.date,
      amount: txn.amount,
      payeeName: txn.payee_name ?? accountsMap.get(txn.account_id) ?? 'Unknown merchant',
      categoryName: txn.category_name ?? null,
      accountName: accountsMap.get(txn.account_id),
    }));

    return {
      transactions: mapped,
      isLoading: status.isRefreshing,
      statusMessage:
        mapped.length === 0
          ? 'No spending yet for your tracked cards.'
          : '',
      infoMessage: entry.fetchedAt ? `Last synced ${new Date(entry.fetchedAt).toLocaleString()}` : undefined,
      lastUpdated: entry.fetchedAt,
    };
  }, [
    state.cachedData?.dashboardTransactions,
    state.connectionStatus,
    state.pat,
    state.selectedBudget.id,
    state.trackedAccountIds,
    status.isHydrated,
    status.isRefreshing,
  ]);
}

export default function TransactionsScreen() {
  const navigation = useNavigation();
  const { impact } = useHaptics();
  const { transactions, isLoading, statusMessage, infoMessage } = useTransactionsContent();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }),
    []
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitle: true,
      title: 'Activity',
      headerSearchBarOptions: {
        placeholder: 'Search transactions',
      },
    });
  }, [navigation]);

  const renderHeader = React.useCallback(() => {
    if (!infoMessage && !(isLoading && transactions.length > 0)) {
      return null;
    }

    return (
      <View style={styles.noticeContainer}>
        {infoMessage ? <Footnote color="secondary">{infoMessage}</Footnote> : null}
        {isLoading && transactions.length > 0 ? (
          <Footnote color="tertiary">Refreshing transactions…</Footnote>
        ) : null}
      </View>
    );
  }, [infoMessage, isLoading, transactions.length]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <Card>
            <ListItem
              onPress={() => {
                impact('light');
                console.log('Transaction tapped:', item.id);
              }}
              showDisclosure
            >
              <View style={styles.transactionRow}>
                <View style={styles.transactionInfo}>
                  <Headline>{item.payeeName}</Headline>
                  <Footnote color="secondary">
                    {[item.categoryName ?? 'Uncategorised', item.accountName, new Date(item.date).toLocaleDateString()]
                      .filter(Boolean)
                      .join(' • ')}
                  </Footnote>
                </View>
                <Headline
                  style={
                    item.amount < 0
                      ? styles.amountNegative
                      : styles.amountPositive
                  }
                >
                  {currencyFormatter.format(Math.abs(item.amount) / 1000)}
                </Headline>
              </View>
            </ListItem>
          </Card>
        )}
        ListEmptyComponent={() => (
          <Card>
            <ListItem>
              <Footnote color="secondary">
                {isLoading ? 'Loading transactions…' : statusMessage || 'No transactions yet.'}
              </Footnote>
            </ListItem>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  listContent: {
    padding: 16,
  },
  noticeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 4,
  },
  separator: {
    height: 12,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  transactionInfo: {
    flex: 1,
    gap: 4,
  },
  amountNegative: {
    color: semanticColors.label,
  },
  amountPositive: {
    color: semanticColors.systemGreen,
  },
});
