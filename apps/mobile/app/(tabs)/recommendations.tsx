/**
 * Recommendations Tab - Feature Flagged
 *
 * This tab is controlled by the `featureFlags.recommendations` flag
 * (see packages/app-core/src/config/featureFlags.ts and (tabs)/_layout.tsx).
 * Currently disabled as the feature needs further testing and refinement.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, StyleSheet, type ColorValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { RecommendationEngine } from '@ynab-counter/app-core/rewards-engine';
import type { CardRecommendation } from '@ynab-counter/app-core/rewards-engine/types';
import { useStorage } from '@/contexts/StorageContext';
import { useCardSummaries } from './index';
import { Card, ListItem, Headline, Body, Footnote, Caption1 } from '@/components/ios';
import { semanticColors } from '@/theme/semanticColors';

function getActionDetails(action: CardRecommendation['action']): { label: string; color: ColorValue } {
  switch (action) {
    case 'use':
      return { label: 'Use this card now', color: semanticColors.systemGreen };
    case 'consider':
      return { label: 'Consider this card', color: semanticColors.systemOrange };
    case 'avoid':
    default:
      return { label: 'Avoid this card', color: semanticColors.systemRed };
  }
}

export default function RecommendationsScreen() {
  const navigation = useNavigation();
  const { summaries, calculations, isLoading } = useCardSummaries();
  const { state, status } = useStorage();

  const recommendations = useMemo(() => {
    if (calculations.length === 0 || summaries.length === 0) {
      return [] as CardRecommendation[];
    }

    const cards = summaries.map((summary) => summary.card);
    return RecommendationEngine.generateCardRecommendations(cards, calculations);
  }, [calculations, summaries]);

  const infoMessage = isLoading
    ? 'Loading recommendations…'
    : state.connectionStatus !== 'connected'
    ? 'Complete setup to see recommendations.'
    : calculations.length === 0
    ? 'Sync your data from Home to generate recommendations.'
    : undefined;

  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({
        headerLargeTitle: false,
        headerTitle: 'Tips',
        title: 'Tips',
        headerRight: undefined,
        headerSearchBarOptions: undefined,
      });

      return () => {
        parent?.setOptions({
          headerRight: undefined,
          headerSearchBarOptions: undefined,
        });
      };
    }, [navigation])
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          {infoMessage ? (
            <View style={styles.noticeContainer}>
              <Footnote color="secondary">{infoMessage}</Footnote>
            </View>
          ) : null}

          {recommendations.length === 0 ? (
            <Card>
              <ListItem>
                <Footnote color="secondary">
                  {status.isHydrated
                    ? 'No recommendations available yet. Once we see spending, we will suggest the best card.'
                    : 'Loading recommendations…'}
                </Footnote>
              </ListItem>
            </Card>
          ) : (
            recommendations.map((rec, index) => {
              const actionDetails = getActionDetails(rec.action);
              return (
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
                      <Footnote style={{ marginTop: 4, fontWeight: '600', color: actionDetails.color }}>
                        {actionDetails.label}
                      </Footnote>
                    </View>
                  </ListItem>
                </Card>
              );
            })
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
  noticeContainer: {
    padding: 16,
    gap: 8,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    borderRadius: 12,
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
