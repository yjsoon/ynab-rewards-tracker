import React, { useLayoutEffect, useMemo } from 'react';
import type { ComponentType } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHaptics } from '@/hooks/useHaptics';
import { useStorage } from '@/contexts/StorageContext';
import {
  CircleDollarSign,
  CreditCard as CreditCardIcon,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Settings,
} from '@tamagui/lucide-icons';
import { semanticColors, semanticHex, withAlpha } from '@/theme/semanticColors';
import {
  Card,
  ListItem,
  Button,
  ProgressView,
  SectionHeader,
  Separator,
  Body,
  Footnote,
  Title2,
  Headline,
  Caption1,
  Caption2,
} from '@/components/ios';
import {
  SimpleRewardsCalculator,
  type SimplifiedCalculation,
  type SubcategoryCalculation,
  type TransactionWithRewards,
} from '@ynab-counter/app-core/rewards-engine';
import { createRewardCalculationFromSimple } from '@ynab-counter/app-core/rewards-engine/utils/reward-calculation';
import type { CreditCard, RewardCalculation, SubcategoryBreakdown } from '@ynab-counter/app-core/storage/types';
import { findBestDashboardEntry } from '@/lib/dashboardCache';

export const options = {
  title: 'YJAB',
  headerLargeTitle: true,
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export type CardSummary = {
  card: CreditCard;
  period: string;
  calculation: SimplifiedCalculation & { periodStart?: string; periodEnd?: string };
  rewardCalculation: RewardCalculation;
  source: 'stored' | 'computed';
};

type CardSummaryResult = {
  summaries: CardSummary[];
  calculations: RewardCalculation[];
  isEmpty: boolean;
  isLoading: boolean;
};

export function useCardSummaries(): CardSummaryResult {
  const { state, status } = useStorage();

  return useMemo(() => {
    if (!status.isHydrated) {
      return {
        summaries: [],
        calculations: [],
        isEmpty: false,
        isLoading: true,
      };
    }

    if (state.cards.length === 0) {
      return {
        summaries: [],
        calculations: [],
        isEmpty: true,
        isLoading: false,
      };
    }

    const hiddenIds = new Set((state.hiddenCards || []).map((hidden) => hidden.cardId));
    const activeCards = state.cards.filter((card) => !hiddenIds.has(card.id));

    const summaries: CardSummary[] = activeCards
      .map((card) => {
        const period = SimpleRewardsCalculator.calculatePeriod(card);
        const stored = findStoredCalculation(state.calculations, card.id, period.start, period.end);

        if (stored) {
          return {
            card,
            period: stored.period,
            calculation: convertStoredCalculation(card, stored),
            rewardCalculation: stored,
            source: 'stored' as const,
          };
        }

        const transactions = extractCachedTransactions(state, card.ynabAccountId);
        const computed = SimpleRewardsCalculator.calculateCardRewards(
          card,
          transactions,
          period,
          state.settings,
        );

        return {
          card,
          period: computed.period,
          calculation: {
            ...computed,
            periodStart: period.start,
            periodEnd: period.end,
          },
          rewardCalculation: createRewardCalculationFromSimple(card, computed),
          source: 'computed' as const,
        };
      })
      .sort((a, b) => {
        const valueA = a.calculation.rewardEarnedDollars ?? a.calculation.rewardEarned ?? 0;
        const valueB = b.calculation.rewardEarnedDollars ?? b.calculation.rewardEarned ?? 0;
        return valueB - valueA;
      });

    const hasActivity = summaries.some((summary) => {
      const totalSpend = summary.calculation.totalSpend ?? 0;
      const rewardEarned =
        summary.calculation.rewardEarnedDollars ?? summary.calculation.rewardEarned ?? 0;
      return Math.abs(totalSpend) > 0 || Math.abs(rewardEarned) > 0;
    });

    return {
      summaries,
      calculations: summaries.map((summary) => summary.rewardCalculation),
      isEmpty: summaries.length > 0 && !hasActivity,
      isLoading: status.isRefreshing,
    };
  }, [state, status.isHydrated, status.isRefreshing]);
}

function findStoredCalculation(
  calculations: RewardCalculation[],
  cardId: string,
  periodStart: string,
  periodEnd: string,
) {
  return calculations.find((calc) => {
    if (calc.cardId !== cardId) return false;
    const [calcStart, calcEnd] = calc.period.split(' → ');
    return calcStart === periodStart && calcEnd === periodEnd;
  });
}

function convertStoredCalculation(card: CreditCard, stored: RewardCalculation): CardSummary['calculation'] {
  const [periodStart, periodEnd] = stored.period.split(' → ');

  return {
    cardId: stored.cardId,
    period: stored.period,
    periodStart,
    periodEnd,
    rewardType: stored.rewardType,
    totalSpend: stored.totalSpend,
    eligibleSpend: stored.eligibleSpend,
    rewardEarned: stored.rewardEarned,
    rewardEarnedDollars: stored.rewardEarnedDollars ?? stored.rewardEarned,
    minimumSpendMet: stored.minimumMet,
    minimumSpendProgress: stored.minimumProgress,
    maximumSpendExceeded: stored.maximumExceeded,
    maximumSpendProgress: stored.maximumProgress,
    subcategoryBreakdowns: mapStoredSubcategories(card, stored.subcategoryBreakdowns),
  };
}

function mapStoredSubcategories(
  card: CreditCard,
  breakdowns: SubcategoryBreakdown[] | undefined,
): SubcategoryCalculation[] | undefined {
  if (!breakdowns) return undefined;

  return breakdowns.map((entry) => ({
    id: entry.subcategoryId,
    name: entry.name,
    flagColor: entry.flagColor,
    totalSpend: entry.totalSpend,
    eligibleSpend: entry.eligibleSpend,
    eligibleSpendBeforeBlocks: entry.eligibleSpendBeforeBlocks ?? entry.eligibleSpend,
    rewardEarned: entry.rewardEarned,
    rewardEarnedDollars: entry.rewardEarnedDollars ?? entry.rewardEarned,
    rewardRate: deriveRewardRate(card, entry.flagColor ?? null),
    minimumSpendMet: entry.minimumSpendMet,
    maximumSpendExceeded: entry.maximumSpendExceeded,
    active: true,
    excluded: false,
  }));
}

function deriveRewardRate(card: CreditCard, flagColor: string | null): number {
  if (!card.subcategoriesEnabled || !card.subcategories?.length) {
    return card.earningRate ?? 0;
  }

  const matched = card.subcategories.find((subcategory) => subcategory.flagColor === flagColor);
  if (!matched || matched.excludeFromRewards) {
    return 0;
  }

  return matched.rewardValue ?? 0;
}

function extractCachedTransactions(
  state: ReturnType<typeof useStorage>['state'],
  accountId: string,
): TransactionWithRewards[] {
  const entry = findBestDashboardEntry(
    state.cachedData?.dashboardTransactions,
    state.selectedBudget.id,
    state.trackedAccountIds,
  );
  if (!entry) {
    return [];
  }

  return entry.transactions
    .filter((txn) => txn.account_id === accountId)
    .map((txn) => ({ ...txn, rewards: undefined }));
}

const clampPercent = (value: number | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const { impact } = useHaptics();
  const { actions } = useStorage();
  const { summaries, isEmpty, isLoading } = useCardSummaries();

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    const root = parent?.getParent();

    parent?.setOptions({
      headerLargeTitle: false,
      headerTitle: 'YJAB',
      title: 'YJAB',
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Button
            variant="plain"
            size="small"
            onPress={() => {
              impact('light');
              (root ?? navigation).navigate('settings' as never);
            }}
            accessibilityLabel="Settings"
            accessibilityHint="Open settings"
            style={styles.headerButton}
          >
            <Settings size={16} color={semanticHex.systemBlue} />
          </Button>
          <Button
            variant="plain"
            size="small"
            onPress={() => {
              impact('light');
              actions.refresh().catch((error) => {
                console.error('Refresh failed', error);
              });
            }}
            accessibilityLabel="Refresh rewards data"
            accessibilityHint="Reload latest storage snapshot"
            style={styles.headerButton}
          >
            <RefreshCw size={16} color={semanticHex.systemBlue} />
          </Button>
        </View>
      ),
    });

    return () => {
      parent?.setOptions({ headerRight: undefined });
    };
  }, [navigation, actions, impact]);

  const featured = useMemo(() => {
    if (summaries.length === 0 || isEmpty) return null;
    return [...summaries]
      .sort((a, b) => {
        const valueA = a.calculation.rewardEarnedDollars ?? a.calculation.rewardEarned ?? 0;
        const valueB = b.calculation.rewardEarnedDollars ?? b.calculation.rewardEarned ?? 0;
        return valueB - valueA;
      })[0];
  }, [summaries, isEmpty]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          {featured ? (
            <FeaturedCardHighlight summary={featured} haptics={impact} />
          ) : isLoading ? null : (
            <EmptyState />
          )}

          {summaries.length > 0 ? (
            <>
              <SectionHeader>Active Cards</SectionHeader>

              {summaries.map((summary) => (
                <View key={`${summary.card.id}-${summary.period}`} style={styles.cardSection}>
                  <Card>
                    <ListItem>
                      <View style={styles.cardHeader}>
                        <CardIcon cardType={summary.card.type} />
                        <View style={styles.cardHeaderText}>
                          <Headline>{summary.card.name}</Headline>
                          <Footnote color="secondary">{summary.card.issuer}</Footnote>
                        </View>
                        {summary.source !== 'stored' ? (
                          <View
                            style={[
                              styles.sourceBadge,
                              summary.source === 'demo' ? styles.demoBadge : styles.computedBadge,
                            ]}
                          >
                            <Caption2 color="primary">{summary.source === 'demo' ? 'DEMO' : 'LIVE'}</Caption2>
                          </View>
                        ) : null}
                      </View>
                    </ListItem>

                    <Separator inset={16} />

                    <ListItem>
                      <View style={styles.periodInfo}>
                        <Caption1 color="tertiary">Current period</Caption1>
                        <Body>{summary.period}</Body>
                      </View>
                    </ListItem>

                    <Separator inset={16} />

                    <ListItem>
                      <View style={styles.statsGrid}>
                        <StatBlock
                          icon={TrendingUp}
                          label="Reward earned"
                          value={currencyFormatter.format(summary.calculation.rewardEarnedDollars)}
                        />
                        <StatBlock
                          icon={CircleDollarSign}
                          label="Total spend"
                          value={currencyFormatter.format(summary.calculation.totalSpend)}
                        />
                      </View>
                    </ListItem>

                    {typeof summary.calculation.minimumSpendProgress === 'number' ? (
                      <>
                        <Separator inset={16} />
                        <ListItem>
                          <ProgressSection
                            title="Minimum spend"
                            value={summary.calculation.minimumSpendProgress}
                            helper={summary.calculation.minimumSpendMet ? 'Goal hit' : 'Keep going'}
                          />
                        </ListItem>
                      </>
                    ) : null}

                    {typeof summary.calculation.maximumSpendProgress === 'number' ? (
                      <>
                        <Separator inset={16} />
                        <ListItem>
                          <ProgressSection
                            title="Maximum cap"
                            value={summary.calculation.maximumSpendProgress}
                            helper={summary.calculation.maximumSpendExceeded ? 'Cap reached' : 'Room remaining'}
                            tone="secondary"
                          />
                        </ListItem>
                      </>
                    ) : null}

                    {summary.calculation.subcategoryBreakdowns?.length ? (
                      <>
                        <Separator inset={16} />
                        <ListItem>
                          <View style={styles.subcategoriesHeader}>
                            <Body style={styles.subcategoriesTitle}>Subcategory activity</Body>
                            <TouchableOpacity
                              onPress={() => {
                                impact('light');
                                console.log('See category breakdown');
                              }}
                              style={styles.manageButton}
                              accessibilityLabel={`View detailed categories for ${summary.card.name}`}
                              accessibilityHint="Opens detailed category breakdown"
                            >
                              <Caption1 color="primary">See all</Caption1>
                              <ChevronRight size={14} color={semanticHex.systemBlue} />
                            </TouchableOpacity>
                          </View>
                        </ListItem>

                        {summary.calculation.subcategoryBreakdowns.slice(0, 3).map((entry) => (
                          <View key={entry.id} style={styles.subcategoryItem}>
                            <Separator inset={16} />
                            <ListItem>
                              <View style={styles.subcategoryContent}>
                                <View style={styles.subcategoryInfo}>
                                  <Body>{entry.name}</Body>
                                  <Caption2 color="secondary">
                                    {currencyFormatter.format(entry.totalSpend)} spent
                                  </Caption2>
                                </View>
                                <Footnote color="primary">
                                  {currencyFormatter.format(entry.rewardEarnedDollars ?? entry.rewardEarned ?? 0)}
                                </Footnote>
                              </View>
                            </ListItem>
                          </View>
                        ))}
                      </>
                    ) : null}

                    <Separator inset={16} />

                    <ListItem
                      onPress={() => {
                        impact('light');
                        console.log('Manage card');
                      }}
                      showDisclosure
                      accessibilityLabel={`Manage settings for ${summary.card.name}`}
                      accessibilityHint="Opens card configuration and preferences"
                    >
                      <Body>Manage card</Body>
                    </ListItem>
                  </Card>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedCardHighlight({
  summary,
  haptics,
}: {
  summary: CardSummary;
  haptics: (style: 'light' | 'medium' | 'heavy') => void;
}) {
  const rewardDisplay = currencyFormatter.format(summary.calculation.rewardEarnedDollars);
  const spendDisplay = currencyFormatter.format(summary.calculation.eligibleSpend);
  const effectiveRate = SimpleRewardsCalculator.calculateEffectiveRate(summary.calculation);

  return (
    <View style={styles.featuredSection}>
      <Card style={styles.featuredCard}>
        <TouchableOpacity
          onPress={() => {
            haptics('medium');
            console.log('See transaction insights');
          }}
          style={styles.featuredContent}
          accessibilityLabel={`See insights for ${summary.card.name}`}
          accessibilityHint="Opens detailed breakdown of rewards and spending"
        >
          <View style={styles.featuredHeader}>
            <View style={styles.featuredHeaderText}>
              <Caption1 color="secondary">Suggested focus card</Caption1>
              <Headline>{summary.card.name}</Headline>
              <Footnote color="secondary">{summary.card.issuer}</Footnote>
            </View>
            {summary.source !== 'stored' && (
              <View
                style={[
                  styles.sourceBadge,
                  summary.source === 'demo' ? styles.demoBadge : styles.computedBadge,
                ]}
              >
                <Caption2 color="primary">{summary.source === 'demo' ? 'DEMO' : 'LIVE'}</Caption2>
              </View>
            )}
          </View>

          <Body color="secondary" style={styles.featuredCopy}>
            Earned <Body style={styles.featuredHighlight}>{rewardDisplay}</Body> so far this period from{' '}
            <Body style={styles.featuredHighlight}>{spendDisplay}</Body> of eligible spend. Effective rate{' '}
            <Body style={styles.featuredHighlight}>{effectiveRate.toFixed(2)}%</Body>.
          </Body>

          <Button
            variant="filled"
            size="medium"
            onPress={() => {
              haptics('medium');
              console.log('See transaction insights');
            }}
            accessibilityLabel={`See transaction insights for ${summary.card.name}`}
            accessibilityHint="Opens detailed breakdown of rewards and spending"
          >
            See transaction insights
          </Button>
        </TouchableOpacity>
      </Card>
    </View>
  );
}

function ProgressSection({
  title,
  value,
  helper,
  tone = 'primary',
}: {
  title: string;
  value: number;
  helper: string;
  tone?: 'primary' | 'secondary';
}) {
  const normalizedValue = Math.max(0, Math.min(100, value)) / 100;
  const tintColor = tone === 'secondary'
    ? semanticColors.systemOrange
    : semanticColors.systemBlue;

  return (
    <View style={styles.progressSection}>
      <View style={styles.progressHeader}>
        <Footnote color="tertiary">{title}</Footnote>
        <Caption1 color="secondary">{helper}</Caption1>
      </View>
      <ProgressView value={normalizedValue} tintColor={tintColor} style={styles.progressBar} />
    </View>
  );
}

type StatBlockIcon = ComponentType<{ size?: number; color?: string }>;

function StatBlock({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: StatBlockIcon;
}) {
  return (
    <View style={styles.statBlock}>
      <Icon size={20} color={semanticHex.systemBlue} />
      <Caption2 color="secondary" style={styles.statLabel}>
        {label}
      </Caption2>
      <Footnote style={styles.statValue}>{value}</Footnote>
    </View>
  );
}

function CardIcon({ cardType }: { cardType: CreditCard['type'] }) {
  const color = cardType === 'cashback'
    ? semanticHex.systemBlue
    : semanticHex.systemPurple;

  return (
    <View style={[styles.cardIcon, { backgroundColor: withAlpha(color, '20') }]}
    >
      <CreditCardIcon size={16} color={color} />
    </View>
  );
}

function EmptyState() {
  const navigation = useNavigation();
  const { impact } = useHaptics();

  return (
    <View style={styles.emptyStateContainer}>
      <Card style={styles.emptyStateCard}>
        <ListItem>
          <View style={styles.emptyStateContent}>
            <AlertCircle size={40} color={semanticHex.systemGray2} />
            <Headline style={styles.emptyTitle}>No cards configured yet</Headline>
            <Body color="secondary" style={styles.emptyCopy}>
              Connect your YNAB account and add a card to start tracking live rewards.
            </Body>
            <Button
              variant="filled"
              size="medium"
              onPress={() => {
                impact('medium');
                navigation.navigate('settings' as never);
              }}
              accessibilityLabel="Go to settings"
              accessibilityHint="Opens settings to connect YNAB"
            >
              Go to Settings
            </Button>
          </View>
        </ListItem>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.systemBackground as string,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 24,
  },
  introSection: {
    marginBottom: 8,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  featuredSection: {
    marginBottom: 24,
  },
  featuredCard: {
    backgroundColor: semanticColors.secondarySystemBackground as string,
  },
  featuredContent: {
    gap: 16,
    padding: 20,
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  featuredHeaderText: {
    flex: 1,
    gap: 4,
  },
  featuredCopy: {
    lineHeight: 20,
  },
  featuredHighlight: {
    color: semanticColors.systemBlue as string,
    fontWeight: '600',
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: semanticColors.tertiarySystemFill as string,
  },
  demoBadge: {
    backgroundColor: withAlpha(semanticHex.systemOrange, '30'),
  },
  computedBadge: {
    backgroundColor: withAlpha(semanticHex.systemGreen, '30'),
  },
  cardSection: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    fontWeight: '600',
  },
  progressSection: {
    flex: 1,
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  subcategoriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subcategoriesTitle: {
    fontWeight: '600',
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subcategoryItem: {
    flex: 1,
  },
  subcategoryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  subcategoryInfo: {
    flex: 1,
    gap: 2,
  },
  emptyStateContainer: {
    marginTop: 16,
  },
  emptyStateCard: {
    paddingVertical: 24,
  },
  emptyStateContent: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptyCopy: {
    textAlign: 'center',
  },
});
