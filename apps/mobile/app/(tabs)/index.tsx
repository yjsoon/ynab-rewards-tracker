import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHaptics } from '@/hooks/useHaptics';
import { CircleDollarSign, CreditCard as CreditCardIcon, TrendingUp } from '@tamagui/lucide-icons';
import { semanticColors } from '@/theme/semanticColors';

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
} from '@/components/ios';

import type {
  AppSettings,
  CreditCard,
} from '@ynab-counter/app-core/storage/types';
import {
  SimpleRewardsCalculator,
  type SimplifiedCalculation,
  type Transaction,
  type TransactionWithRewards,
} from '@ynab-counter/app-core/rewards-engine';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const appSettings: AppSettings = {
  milesValuation: 0.012,
  currency: 'USD',
};

const sampleCards: CreditCard[] = [
  {
    id: 'cash-hero',
    name: 'Cash Hero Everyday',
    issuer: 'Metro Bank',
    type: 'cashback',
    ynabAccountId: 'account-cash',
    featured: true,
    earningRate: 2.5,
    earningBlockSize: null,
    minimumSpend: 600,
    maximumSpend: 2500,
    billingCycle: { type: 'calendar' },
    subcategoriesEnabled: true,
    subcategories: [
      {
        id: 'groceries',
        name: 'Groceries',
        flagColor: 'blue',
        rewardValue: 4,
        milesBlockSize: null,
        minimumSpend: 400,
        maximumSpend: 1200,
        priority: 1,
        active: true,
        excludeFromRewards: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'dining',
        name: 'Dining',
        flagColor: 'red',
        rewardValue: 3,
        milesBlockSize: null,
        minimumSpend: null,
        maximumSpend: null,
        priority: 2,
        active: true,
        excludeFromRewards: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'miles-plus',
    name: 'Miles Plus Premier',
    issuer: 'Skyward',
    type: 'miles',
    ynabAccountId: 'account-miles',
    featured: false,
    earningRate: 1.8,
    earningBlockSize: 5,
    minimumSpend: 1000,
    maximumSpend: null,
    billingCycle: { type: 'billing', dayOfMonth: 20 },
    subcategoriesEnabled: false,
  },
];

const sampleTransactions: Record<string, Transaction[]> = {
  'cash-hero': [
    {
      id: 'txn-1',
      account_id: 'account-cash',
      amount: -125_000,
      approved: true,
      cleared: 'cleared',
      date: '2024-10-02',
      payee_name: 'Fresh Market',
      category_name: 'Groceries',
      flag_color: 'blue',
    },
    {
      id: 'txn-2',
      account_id: 'account-cash',
      amount: -89_990,
      approved: true,
      cleared: 'cleared',
      date: '2024-10-04',
      payee_name: 'Sushi Hub',
      category_name: 'Dining',
      flag_color: 'red',
    },
    {
      id: 'txn-3',
      account_id: 'account-cash',
      amount: -64_430,
      approved: true,
      cleared: 'cleared',
      date: '2024-10-08',
      payee_name: 'Whole Pantry',
      category_name: 'Groceries',
      flag_color: 'blue',
    },
  ],
  'miles-plus': [
    {
      id: 'txn-4',
      account_id: 'account-miles',
      amount: -408_750,
      approved: true,
      cleared: 'cleared',
      date: '2024-09-23',
      payee_name: 'Voyage Airlines',
      category_name: 'Travel',
    },
    {
      id: 'txn-5',
      account_id: 'account-miles',
      amount: -112_000,
      approved: true,
      cleared: 'cleared',
      date: '2024-10-01',
      payee_name: 'City Taxi',
      category_name: 'Transport',
    },
    {
      id: 'txn-6',
      account_id: 'account-miles',
      amount: -189_500,
      approved: true,
      cleared: 'cleared',
      date: '2024-10-05',
      payee_name: 'World Bistro',
      category_name: 'Dining',
    },
  ],
};

type CardSummary = {
  card: CreditCard;
  period: SimplifiedCalculation['period'];
  calculation: SimplifiedCalculation;
};

const clampPercent = (value: number | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const { impact } = useHaptics();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitle: true,
      title: 'YJAB',
    });
  }, [navigation]);

  const summaries = useMemo<CardSummary[]>(() => {
    return sampleCards.map((card) => {
      const period = SimpleRewardsCalculator.calculatePeriod(card);
      const transactions = sampleTransactions[card.id] ?? [];
      const calculation = SimpleRewardsCalculator.calculateCardRewards(
        card,
        transactions as TransactionWithRewards[],
        period,
        appSettings,
      );
      return { card, period: calculation.period, calculation };
    });
  }, []);

  const featured = useMemo(() => {
    return [...summaries].sort(
      (a, b) => b.calculation.rewardEarnedDollars - a.calculation.rewardEarnedDollars,
    )[0];
  }, [summaries]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <View style={styles.introSection}>
            <Footnote color="secondary">
              Track credit card rewards momentum. Demos use representative data.
            </Footnote>
          </View>

          {featured ? <FeaturedCardHighlight summary={featured} haptics={impact} /> : null}

          <SectionHeader>Active Cards</SectionHeader>

          {summaries.map((summary, index) => (
            <View key={summary.card.id} style={styles.cardSection}>
              <Card>
                <ListItem>
                  <View style={styles.cardHeader}>
                    <CardIcon cardType={summary.card.type} />
                    <View style={styles.cardHeaderText}>
                      <Headline>{summary.card.name}</Headline>
                      <Footnote color="secondary">{summary.card.issuer}</Footnote>
                    </View>
                  </View>
                </ListItem>

                <Separator inset={16} />

                <ListItem>
                  <View style={styles.periodInfo}>
                    <Caption1 color="tertiary">CURRENT PERIOD</Caption1>
                    <Body>{summary.period}</Body>
                  </View>
                </ListItem>

                <Separator inset={16} />

                <ListItem>
                  <View style={styles.statsGrid}>
                    <StatBlock
                      label="Reward earned"
                      value={currencyFormatter.format(summary.calculation.rewardEarnedDollars)}
                      icon={TrendingUp}
                    />
                    <StatBlock
                      label="Total spend"
                      value={currencyFormatter.format(summary.calculation.totalSpend)}
                      icon={CircleDollarSign}
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
                        helper={summary.calculation.minimumSpendMet ? 'Goal hit' : 'Almost there'}
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
                      <View style={styles.subcategoriesSection}>
                        <Body style={styles.subcategoriesTitle}>Subcategory activity</Body>
                        <View style={styles.subcategoriesList}>
                          {summary.calculation.subcategoryBreakdowns.slice(0, 3).map((entry) => (
                            <View key={entry.id} style={styles.subcategoryRow}>
                              <Body>{entry.name}</Body>
                              <Footnote color="secondary">
                                {currencyFormatter.format(entry.rewardEarnedDollars ?? entry.rewardEarned ?? 0)}
                              </Footnote>
                            </View>
                          ))}
                        </View>
                      </View>
                    </ListItem>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedCardHighlight({
  summary,
  haptics
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
        <ListItem>
          <View style={styles.featuredContent}>
            <View style={styles.featuredHeader}>
              <TrendingUp size={24} color={semanticColors.systemBlue as string} />
              <View style={styles.featuredHeaderText}>
                <Caption1 color="secondary">SUGGESTED FOCUS CARD</Caption1>
                <Headline>{summary.card.name}</Headline>
              </View>
            </View>

            <View style={styles.featuredStats}>
              <Body color="secondary">
                Earned <Body style={styles.featuredHighlight}>{rewardDisplay}</Body> so far this period from{' '}
                <Body style={styles.featuredHighlight}>{spendDisplay}</Body> of eligible spend. Effective rate{' '}
                <Body style={styles.featuredHighlight}>{effectiveRate.toFixed(2)}%</Body>.
              </Body>
            </View>

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
          </View>
        </ListItem>
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
    ? semanticColors.systemGray
    : semanticColors.systemBlue;

  return (
    <View style={styles.progressSection}>
      <View style={styles.progressHeader}>
        <Body>{title}</Body>
        <Footnote color="secondary">{Math.round(value)}%</Footnote>
      </View>
      <ProgressView
        value={normalizedValue}
        tintColor={tintColor}
        accessibilityLabel={`${title} progress`}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(value),
        }}
        accessibilityHint={helper}
      />
      <Caption1 color="tertiary" style={styles.progressHelper}>{helper}</Caption1>
    </View>
  );
}

function StatBlock({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: (props: { size?: number; color?: string }) => React.ReactElement;
}) {
  return (
    <View style={styles.statBlock}>
      <View style={styles.statHeader}>
        <Icon size={16} color={semanticColors.systemBlue as string} />
        <Caption1 color="secondary">{label}</Caption1>
      </View>
      <Headline>{value}</Headline>
    </View>
  );
}

function CardIcon({ cardType }: { cardType: CreditCard['type'] }) {
  const color = (cardType === 'cashback'
    ? semanticColors.systemBlue
    : semanticColors.systemPurple) as string;
  return <CreditCardIcon size={24} color={color} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  content: {
    gap: 8,
  },
  introSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featuredSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  featuredCard: {
    overflow: 'visible',
  },
  featuredContent: {
    gap: 16,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featuredHeaderText: {
    flex: 1,
    gap: 2,
  },
  featuredStats: {
    paddingVertical: 8,
  },
  featuredHighlight: {
    fontWeight: '600',
    color: semanticColors.systemBlue,
  },
  cardSection: {
    paddingHorizontal: 16,
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
  periodInfo: {
    gap: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBlock: {
    flex: 1,
    gap: 8,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressSection: {
    gap: 8,
    width: '100%',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressHelper: {
    marginTop: 4,
  },
  subcategoriesSection: {
    gap: 12,
    width: '100%',
  },
  subcategoriesTitle: {
    fontWeight: '600',
  },
  subcategoriesList: {
    gap: 8,
  },
  subcategoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});