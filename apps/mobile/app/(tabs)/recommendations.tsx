import { ScrollView } from 'react-native';
import { YStack, Card, H2, Text, Paragraph, XStack } from 'tamagui';
import { useDemoRewards } from '@/hooks/useDemoRewards';

export default function RecommendationsScreen() {
  const { recommendations } = useDemoRewards();

  return (
    <ScrollView style={{ flex: 1 }}>
      <YStack padding="$4" gap="$4" backgroundColor="$background">
        <H2>Recommendations</H2>

        {recommendations.length === 0 ? (
          <Card padding="$4" bordered>
            <Paragraph theme="alt1">No recommendations available yet.</Paragraph>
          </Card>
        ) : (
          recommendations.map((rec, index) => (
            <Card key={index} elevate size="$4" bordered padding="$4">
              <YStack gap="$2">
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize="$6" fontWeight="700">{rec.cardName}</Text>
                  <Paragraph
                    size="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$1.5"
                    borderRadius="$4"
                    backgroundColor={
                      rec.priority === 'high'
                        ? '$error'
                        : rec.priority === 'medium'
                        ? '$warning'
                        : '$success'
                    }
                    color="white"
                    fontWeight="600"
                    textTransform="capitalize"
                  >
                    {rec.priority}
                  </Paragraph>
                </XStack>
                <Paragraph size="$3">{rec.reason}</Paragraph>
                {rec.action && (
                  <Paragraph size="$2" theme="alt1">
                    {rec.action}
                  </Paragraph>
                )}
              </YStack>
            </Card>
          ))
        )}

        <Paragraph theme="alt1" size="$2" textAlign="center">
          Recommendations powered by shared rewards engine
        </Paragraph>
      </YStack>
    </ScrollView>
  );
}