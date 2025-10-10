import { FlatList } from 'react-native';
import { YStack, XStack, Card, H2, Paragraph } from 'tamagui';
import { useDemoRewards } from '@/hooks/useDemoRewards';

export default function TransactionsScreen() {
  const { transactions } = useDemoRewards();

  return (
    <YStack flex={1} backgroundColor="$background">
      <YStack padding="$4" paddingBottom="$2">
        <H2>Activity</H2>
      </YStack>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <YStack height="$2" />}
        renderItem={({ item }) => (
          <Card bordered padding="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <YStack flex={1} gap="$1">
                <Paragraph size="$4" fontWeight="600">
                  {item.payeeName}
                </Paragraph>
                <Paragraph size="$2" theme="alt1">
                  {item.category} • {new Date(item.date).toLocaleDateString()}
                </Paragraph>
              </YStack>
              <Paragraph
                size="$4"
                fontWeight="600"
                color={item.amount < 0 ? '$color' : '$success'}
              >
                ${(Math.abs(item.amount) / 1000).toFixed(2)}
              </Paragraph>
            </XStack>
          </Card>
        )}
        ListEmptyComponent={
          <Card padding="$4" bordered>
            <Paragraph theme="alt1">No transactions yet.</Paragraph>
          </Card>
        }
      />
    </YStack>
  );
}