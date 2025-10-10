import { ScrollView } from 'react-native';
import { YStack, XStack, Card, H2, H6, Paragraph, Button, Separator } from 'tamagui';
import { useDemoRewards } from '@/hooks/useDemoRewards';
import { ProgressBar } from '@/components/ProgressBar';

export default function HomeScreen() {
  const { card, calculation, period, effectiveRate } = useDemoRewards();

  // Demo placeholder – will wire real storage later
  const minSpendProgress = calculation?.minimumSpendProgress ?? 0;
  const maxSpendProgress = calculation?.maximumSpendProgress ?? 0;

  const rewardEarned = calculation?.rewardEarnedDollars ?? calculation?.rewardEarned ?? 0;
  const totalSpend = calculation?.totalSpend ?? 0;

  return (
    <ScrollView style={{ flex: 1 }}>
      <YStack padding="$4" gap="$4" backgroundColor="$background">
        <H2>Dashboard</H2>

        <Card elevate size="$4" bordered padding="$4">
          <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <H6>{card.name}</H6>
              <Paragraph theme="alt1" size="$2">
                {period?.label ?? 'Current Period'}
              </Paragraph>
            </XStack>

            <Separator />

            <YStack gap="$2">
              <Paragraph size="$5" fontWeight="600">
                {effectiveRate.toFixed(2)}%
              </Paragraph>
              <Paragraph theme="alt1" size="$2">
                Effective Reward Rate
              </Paragraph>
            </YStack>

            <XStack gap="$4">
              <YStack flex={1} gap="$1">
                <Paragraph size="$4" fontWeight="600" color="$success">
                  ${rewardEarned.toFixed(2)}
                </Paragraph>
                <Paragraph theme="alt1" size="$2">
                  Rewards Earned
                </Paragraph>
              </YStack>
              <YStack flex={1} gap="$1">
                <Paragraph size="$4" fontWeight="600">
                  ${totalSpend.toFixed(2)}
                </Paragraph>
                <Paragraph theme="alt1" size="$2">
                  Total Spend
                </Paragraph>
              </YStack>
            </XStack>

            {minSpendProgress > 0 && (
              <YStack gap="$2">
                <XStack justifyContent="space-between">
                  <Paragraph size="$2">Minimum Spend</Paragraph>
                  <Paragraph size="$2" theme="alt1">
                    {minSpendProgress.toFixed(0)}%
                  </Paragraph>
                </XStack>
                <ProgressBar value={minSpendProgress} color="$success" />
              </YStack>
            )}

            {maxSpendProgress > 0 && (
              <YStack gap="$2">
                <XStack justifyContent="space-between">
                  <Paragraph size="$2">Maximum Spend</Paragraph>
                  <Paragraph size="$2" theme="alt1">
                    {maxSpendProgress.toFixed(0)}%
                  </Paragraph>
                </XStack>
                <ProgressBar value={maxSpendProgress} color="$warning" />
              </YStack>
            )}

            <Button theme="blue" marginTop="$2">
              View Details
            </Button>
          </YStack>
        </Card>

        <Paragraph theme="alt1" size="$2" textAlign="center">
          Demo mode – connect YNAB in Settings
        </Paragraph>
      </YStack>
    </ScrollView>
  );
}