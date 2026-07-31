import React, { useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  EmptyState,
  LargeNavigationTitle,
  SectionTitle,
} from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { useRewardsDashboard } from '@/features/cards/dashboard';
import {
  RewardCategoryCompositionRail,
  RewardCategoryRow,
} from '@/features/cards/RewardCategoryBreakdown';
import { collectRewardCategories } from '@/features/cards/reward-categories';
import {
  createCardFormatting,
  formatPeriod,
} from '@/features/cards/presentation';
import { semanticColors } from '@/theme';
import { nativeMetrics, radii, spacing } from '@/theme/tokens';

export default function RewardCategoriesScreen() {
  const router = useRouter();
  const { state } = useStorage();
  const model = useRewardsDashboard();
  const formatting = useMemo(
    () => createCardFormatting(state.settings),
    [state.settings],
  );
  const categories = useMemo(
    () => collectRewardCategories(model.visibleCards),
    [model.visibleCards],
  );
  const groups = useMemo(
    () => model.visibleCards
      .map((card) => ({ card, categories: collectRewardCategories([card]) }))
      .filter((group) => group.categories.length > 0),
    [model.visibleCards],
  );

  const openCategory = (cardId: string, categoryId: string) => {
    router.push({ pathname: '/card/[id]', params: { id: cardId, categoryId } });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustsScrollIndicatorInsets
      refreshControl={(
        <RefreshControl
          refreshing={model.isRefreshing}
          onRefresh={model.refresh}
          enabled={model.canSync}
          tintColor={semanticColors.action}
          accessibilityLabel="Refresh reward categories from YNAB"
        />
      )}
    >
      <LargeNavigationTitle>Reward categories</LargeNavigationTitle>
      {categories.length === 0 ? (
        <EmptyState
          compact
          title="No active reward categories"
          action={{
            label: 'Review cards',
            onPress: () => router.push('/(tabs)/cards'),
          }}
        />
      ) : (
        <>
          {groups.length > 1 ? (
            <RewardCategoryCompositionRail
              categories={categories}
              formatting={formatting}
            />
          ) : null}

          {groups.map((group) => (
            <View key={group.card.card.id} style={styles.group}>
              <SectionTitle
                title={group.card.card.name}
                subtitle={`${formatPeriod(group.card.period)} · ${group.categories.length} ${group.categories.length === 1 ? 'category' : 'categories'}`}
              />
              <RewardCategoryCompositionRail
                categories={group.categories}
                formatting={formatting}
              />
              <View style={styles.rows}>
                {group.categories.map((item, index) => (
                  <RewardCategoryRow
                    key={item.key}
                    item={item}
                    formatting={formatting}
                    onPress={() => openCategory(group.card.card.id, item.category.id)}
                    showDivider={index < group.categories.length - 1}
                    showCardName={false}
                  />
                ))}
              </View>
            </View>
          ))}
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
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.xxxl,
  },
  group: {
    gap: spacing.sm,
  },
  rows: {
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
});
