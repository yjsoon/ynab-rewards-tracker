import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDemoRewards } from '@/hooks/useDemoRewards';
import { Card, ListItem, Headline, Body, Footnote, Caption1 } from '@/components/ios';
import { semanticColors } from '@/theme/semanticColors';

export default function RecommendationsScreen() {
  const navigation = useNavigation();
  const { recommendations } = useDemoRewards();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitle: true,
      title: 'Recommendations',
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          {recommendations.length === 0 ? (
            <Card>
              <ListItem>
                <Footnote color="secondary">No recommendations available yet.</Footnote>
              </ListItem>
            </Card>
          ) : (
            recommendations.map((rec, index) => (
              <Card key={index}>
                <ListItem>
                  <View style={styles.recommendationContent}>
                    <View style={styles.recommendationHeader}>
                      <Headline>{rec.cardName}</Headline>
                      <View style={[styles.priorityBadge, styles[`priority${rec.priority}`]]}>
                        <Caption1 style={styles.priorityBadgeText}>
                          {rec.priority.toUpperCase()}
                        </Caption1>
                      </View>
                    </View>
                    <Body color="secondary">{rec.reason}</Body>
                    {rec.action && (
                      <Footnote color="tertiary">{rec.action}</Footnote>
                    )}
                  </View>
                </ListItem>
              </Card>
            ))
          )}

          <View style={styles.footer}>
            <Footnote color="tertiary" style={styles.footerText}>
              Recommendations powered by shared rewards engine
            </Footnote>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  content: {
    gap: 16,
  },
  recommendationContent: {
    gap: 12,
    width: '100%',
  },
  recommendationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityBadgeText: {
    color: semanticColors.primaryButtonForeground,
    fontWeight: '600',
  },
  priorityhigh: {
    backgroundColor: semanticColors.systemRed,
  },
  prioritymedium: {
    backgroundColor: semanticColors.systemOrange,
  },
  prioritylow: {
    backgroundColor: semanticColors.systemGreen,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    textAlign: 'center',
  },
});