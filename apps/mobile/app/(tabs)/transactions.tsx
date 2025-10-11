import React, { useMemo } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDemoRewards } from '@/hooks/useDemoRewards';
import { useHaptics } from '@/hooks/useHaptics';
import { Card, ListItem, Headline, Footnote } from '@/components/ios';
import { semanticColors } from '@/theme/semanticColors';

export default function TransactionsScreen() {
  const navigation = useNavigation();
  const { transactions } = useDemoRewards();
  const { impact } = useHaptics();

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

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
                    {item.category} • {new Date(item.date).toLocaleDateString()}
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
              <Footnote color="secondary">No transactions yet.</Footnote>
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