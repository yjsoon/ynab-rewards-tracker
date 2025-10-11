import React, { useMemo } from 'react';
import {
  Button,
  Card,
  H1,
  H2,
  Paragraph,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { CircleDollarSign, CreditCard as CreditCardIcon, TrendingUp } from '@tamagui/lucide-icons';

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
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <YStack gap="$6">
        <YStack gap="$2">
          <H1 size="$10">YJAB Mobile</H1>
          <Paragraph theme="alt1">
            Keep an eye on your credit card reward momentum wherever you are. These demos use
            representative data to preview the mobile experience.
          </Paragraph>
        </YStack>

        {featured ? <FeaturedCardHighlight summary={featured} /> : null}

        <YStack gap="$4">
          <XStack alignItems="center" justifyContent="space-between">
            <H2 size="$8">Active cards</H2>
            <Button size="$3" themeInverse icon={TrendingUp}>
              View trends
            </Button>
          </XStack>

          <YStack gap="$4">
            {summaries.map((summary) => (
              <Card key={summary.card.id} bordered elevate padding="$4" gap="$3">
                <Card.Header padded={false}>
                  <XStack alignItems="center" gap="$3">
                    <CardIcon cardType={summary.card.type} />
                    <YStack>
                      <Text fontWeight="700" fontSize="$6">
                        {summary.card.name}
                      </Text>
                      <Paragraph theme="alt2">{summary.card.issuer}</Paragraph>
                    </YStack>
                  </XStack>
                </Card.Header>

                <YStack gap="$3">
                  <YStack gap="$2">
                    <Paragraph size="$3" theme="alt2">
                      Current period • {summary.period}
                    </Paragraph>
                    <XStack gap="$4" flexWrap="wrap">
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
                    </XStack>
                  </YStack>

                  {typeof summary.calculation.minimumSpendProgress === 'number' ? (
                    <ProgressSection
                      title="Minimum spend"
                      value={summary.calculation.minimumSpendProgress}
                      helper={summary.calculation.minimumSpendMet ? 'Goal hit' : 'Almost there'}
                    />
                  ) : null}

                  {typeof summary.calculation.maximumSpendProgress === 'number' ? (
                    <ProgressSection
                      title="Maximum cap"
                      value={summary.calculation.maximumSpendProgress}
                      helper={summary.calculation.maximumSpendExceeded ? 'Cap reached' : 'Room remaining'}
                      tone="secondary"
                    />
                  ) : null}

                  {summary.calculation.subcategoryBreakdowns?.length ? (
                    <YStack gap="$2">
                      <Separator />
                      <Text fontWeight="600">Subcategory activity</Text>
                      <YStack gap="$2">
                        {summary.calculation.subcategoryBreakdowns.slice(0, 3).map((entry) => (
                          <XStack key={entry.id} justifyContent="space-between" alignItems="center">
                            <Paragraph>{entry.name}</Paragraph>
                            <Paragraph theme="alt2">
                              {currencyFormatter.format(entry.rewardEarnedDollars ?? entry.rewardEarned ?? 0)}
                            </Paragraph>
                          </XStack>
                        ))}
                      </YStack>
                    </YStack>
                  ) : null}
                </YStack>

                <Card.Footer padded={false}>
                  <Button size="$3" chromeless>
                    Manage card
                  </Button>
                </Card.Footer>
              </Card>
            ))}
          </YStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

function FeaturedCardHighlight({ summary }: { summary: CardSummary }) {
  const rewardDisplay = currencyFormatter.format(summary.calculation.rewardEarnedDollars);
  const spendDisplay = currencyFormatter.format(summary.calculation.eligibleSpend);
  const effectiveRate = SimpleRewardsCalculator.calculateEffectiveRate(summary.calculation);

  return (
    <YStack
      padding="$5"
      borderRadius="$6"
      backgroundColor="$backgroundStrong"
      gap="$4"
      elevation="$4"
    >
      <XStack alignItems="center" gap="$3">
        <TrendingUp size={26} color="var(--colorHover)" />
        <YStack>
          <Paragraph size="$3" theme="alt2">
            Suggested focus card
          </Paragraph>
          <Text fontSize="$7" fontWeight="700">
            {summary.card.name}
          </Text>
        </YStack>
      </XStack>

      <Paragraph theme="alt1">
        Earned <Text color="$color11" fontWeight="700">{rewardDisplay}</Text> so far this period from
        <Text fontWeight="700"> {spendDisplay}</Text> of eligible spend. Effective rate{' '}
        <Text fontWeight="700">{effectiveRate.toFixed(2)}%</Text>.
      </Paragraph>

      <Button size="$3" themeInverse>
        See transaction insights
      </Button>
    </YStack>
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
  const clamped = clampPercent(value);
  const barColor = tone === 'secondary' ? 'var(--color5)' : 'var(--color10)';

  return (
    <YStack gap="$2">
      <XStack justifyContent="space-between" alignItems="center">
        <Paragraph>{title}</Paragraph>
        <Paragraph theme="alt2">{clamped.toFixed(0)}%</Paragraph>
      </XStack>
      <YStack height={8} borderRadius={999} backgroundColor="var(--color2)" overflow="hidden">
        <YStack
          backgroundColor={barColor}
          width={`${clamped}%`}
          height="100%"
          borderRadius={999}
        />
      </YStack>
      <Paragraph size="$2" theme="alt2">
        {helper}
      </Paragraph>
    </YStack>
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
    <YStack padding="$3" borderRadius="$4" backgroundColor="var(--color2)" gap="$2" flexGrow={1}>
      <XStack alignItems="center" gap="$2">
        <Icon size={18} color="var(--color10)" />
        <Paragraph theme="alt2" size="$2">
          {label}
        </Paragraph>
      </XStack>
      <Text fontWeight="700" fontSize="$6">
        {value}
      </Text>
    </YStack>
  );
}

function CardIcon({ cardType }: { cardType: CreditCard['type'] }) {
  const tone = cardType === 'cashback' ? 'var(--color10)' : 'var(--color11)';
  return <CreditCardIcon size={26} color={tone} />;
}