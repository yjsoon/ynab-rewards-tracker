import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useStorage } from '@/contexts/StorageContext';
import {
  EmptyState,
  MetricValue,
  ProgressRail,
  SectionTitle,
  StatusPill,
  SyncBadge,
} from '@/components/native';
import {
  Body,
  Button,
  Caption1,
  Footnote,
  Headline,
  LargeTitle,
  Title2,
  Title3,
} from '@/components/ios';
import {
  getCardAccountName,
  orderCardProjections,
  useRewardsDashboard,
} from '@/features/cards/dashboard';
import {
  attentionCopy,
  createCardFormatting,
  flagColor,
  formatDaysRemaining,
  formatPeriod,
  formatRate,
  formatRewardForCard,
  formatResetDate,
  statusPresentation,
  type CardFormatting,
} from '@/features/cards/presentation';
import { semanticColors } from '@/theme';
import { nativeMetrics, radii, spacing } from '@/theme/tokens';
import type {
  CardDashboardProjection,
  TransactionProjection,
} from '@ynab-counter/app-core/rewards-engine';
import type { CardSubcategory } from '@ynab-counter/app-core/storage';

function parameterValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatHiddenUntil(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function ConfigRow({ label, value, showDivider = true }: {
  label: string;
  value: string;
  showDivider?: boolean;
}) {
  return (
    <View style={[styles.configRow, showDivider && styles.divider]} accessible accessibilityLabel={`${label}, ${value}`}>
      <Body color="secondary" accessible={false} style={styles.configLabel}>{label}</Body>
      <Body accessible={false} style={styles.configValue}>{value}</Body>
    </View>
  );
}

function noRewardCopy(transaction: TransactionProjection): string {
  if (transaction.status === 'incoming') return 'Incoming · no reward';
  switch (transaction.noRewardReason) {
    case 'excluded': return 'Excluded from rewards';
    case 'below_block': return 'Below earning block';
    case 'below_minimum': return 'Minimum not met';
    case 'cap_reached': return 'Cap reached';
    case 'period_incomplete': return 'Reward not confirmed';
    case 'zero_rate': return 'No earning rate';
    case 'zero_amount': return 'No reward';
    default: return 'No reward';
  }
}

function TransactionRow({
  item,
  currency,
  formatReward,
  showDivider,
}: {
  item: TransactionProjection;
  currency: (value: number) => string;
  formatReward: (amount: number, dollars: number) => string;
  showDivider: boolean;
}) {
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${item.transaction.date}T12:00:00`));
  const rewardLabel = item.status === 'earning'
    ? formatReward(item.reward.amount, item.reward.dollars)
    : noRewardCopy(item);
  const context = [item.transaction.category_name, dateLabel].filter(Boolean).join(' · ');
  const blockLabel = item.blockInfo
    ? `${item.blockInfo.count} × ${currency(item.blockInfo.size)} block${item.blockInfo.remainder > 0 ? ` · ${currency(item.blockInfo.remainder)} remainder` : ''}`
    : undefined;

  return (
    <View
      style={[styles.transactionRow, showDivider && styles.divider]}
      accessible
      accessibilityLabel={`${item.transaction.payee_name ?? 'Unknown payee'}, ${currency(item.amount)}, ${rewardLabel}, ${context}`}
    >
      <View style={styles.transactionHeading} accessibilityElementsHidden>
        <View style={styles.transactionCopy}>
          <Headline numberOfLines={2}>{item.transaction.payee_name ?? 'Unknown payee'}</Headline>
          <Footnote color="secondary" numberOfLines={2}>{context}</Footnote>
        </View>
        <View style={styles.transactionAmount}>
          <Headline style={styles.tabular}>{item.status === 'incoming' ? '+' : '−'}{currency(item.amount)}</Headline>
          <Footnote
            color={item.status === 'earning' ? 'positive' : 'secondary'}
            style={styles.transactionReward}
          >
            {rewardLabel}
          </Footnote>
        </View>
      </View>
      {blockLabel ? (
        <Caption1 color="tertiary" style={styles.blockTransactionLabel} accessibilityElementsHidden>
          {blockLabel}
        </Caption1>
      ) : null}
    </View>
  );
}

function SubcategoryRow({
  subcategory,
  projection,
  formatting,
  showDivider,
  highlighted = false,
  onLayout,
}: {
  subcategory: CardSubcategory;
  projection: CardDashboardProjection;
  formatting: CardFormatting;
  showDivider: boolean;
  highlighted?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const currency = formatting.currencyCompact;
  const calculation = projection.calculation.subcategoryBreakdowns?.find(
    (entry) => entry.id === subcategory.id,
  );
  const totalSpend = calculation?.totalSpend ?? 0;
  const progressValue = subcategory.maximumSpend
    ? calculation?.countedSpend ?? totalSpend
    : totalSpend;
  const rewardAmount = calculation?.rewardEarned ?? 0;
  const rewardDollars = calculation?.rewardEarnedDollars ?? 0;
  const rate = formatRate({
    type: projection.card.type,
    earningRate: subcategory.rewardValue,
  }, formatting);
  const reward = formatRewardForCard(
    projection.card,
    rewardAmount,
    rewardDollars,
    formatting,
  );
  const stateLabel = subcategory.active === false
    ? { label: 'Inactive', tone: 'inactive' as const }
    : subcategory.excludeFromRewards
      ? { label: 'Excluded', tone: 'attention' as const }
      : calculation?.maximumSpendExceeded
        ? { label: 'Cap reached', tone: 'capped' as const }
        : { label: 'Active', tone: 'positive' as const };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.subcategoryRow,
        highlighted && styles.highlightedSubcategory,
        showDivider && styles.divider,
      ]}
      accessible
      accessibilityLabel={`${subcategory.name}, ${stateLabel.label}, ${rate}, spent ${currency(totalSpend)}, earned ${reward}`}
    >
      <View style={styles.subcategoryHeading} accessibilityElementsHidden>
        <View style={styles.subcategoryIdentity}>
          <View style={[styles.flagDot, { backgroundColor: flagColor(subcategory.flagColor) }]} />
          <View style={styles.subcategoryCopy}>
            <Headline>{subcategory.name}</Headline>
            <Footnote color="secondary">
              {rate}{subcategory.milesBlockSize ? ` · ${currency(subcategory.milesBlockSize)} blocks` : ''}
            </Footnote>
          </View>
        </View>
        <StatusPill label={stateLabel.label} tone={stateLabel.tone} size="small" accessible={false} />
      </View>

      <View style={styles.subcategoryMetrics} accessibilityElementsHidden>
        <MetricValue label="Earned" value={reward} size="compact" accessible={false} />
        <MetricValue label="Spent" value={currency(totalSpend)} size="compact" align="right" accessible={false} />
      </View>

      {!subcategory.excludeFromRewards && subcategory.active !== false &&
      ((subcategory.minimumSpend ?? 0) > 0 || (subcategory.maximumSpend ?? 0) > 0) ? (
        <View style={styles.progressStack} accessibilityElementsHidden>
          {(subcategory.minimumSpend ?? 0) > 0 ? (
            <ProgressRail
              value={totalSpend}
              minimum={subcategory.minimumSpend}
              formatValue={currency}
              label={`${subcategory.name} minimum spend`}
              accessible={false}
            />
          ) : null}
          {(subcategory.maximumSpend ?? 0) > 0 ? (
            <ProgressRail
              value={progressValue}
              maximum={subcategory.maximumSpend}
              formatValue={currency}
              label={`${subcategory.name} spending cap`}
              accessible={false}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function CardDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    categoryId?: string | string[];
  }>();
  const cardId = parameterValue(params.id);
  const requestedCategoryId = parameterValue(params.categoryId);
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const focusedCategoryRef = useRef<string | undefined>(undefined);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rewardTiersY, setRewardTiersY] = useState<number | null>(null);
  const [rewardTierGroupY, setRewardTierGroupY] = useState<number | null>(null);
  const [categoryOffsets, setCategoryOffsets] = useState<Record<string, number>>({});
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<string>();
  const { state, actions } = useStorage();
  const model = useRewardsDashboard();
  const projection = model.dashboard.cards.find(({ card }) => card.id === cardId);
  const formatting = useMemo(() => createCardFormatting(state.settings), [state.settings]);
  const orderedCards = useMemo(
    () => orderCardProjections(
      model.dashboard.cards,
      state.settings.cardOrdering?.all,
      state.settings.cardOrdering?.cashback,
      state.settings.cardOrdering?.miles,
    ),
    [model.dashboard.cards, state.settings.cardOrdering],
  );
  const cardTransactions = useMemo(
    () => model.transactions
      .filter((transaction) => transaction.card?.id === cardId)
      .sort((left, right) => {
        const byDate = right.transaction.date.localeCompare(left.transaction.date);
        return byDate || right.transaction.id.localeCompare(left.transaction.id);
      })
      .slice(0, 12),
    [cardId, model.transactions],
  );

  useEffect(() => {
    const categoryOffset = requestedCategoryId
      ? categoryOffsets[requestedCategoryId]
      : undefined;
    if (
      !requestedCategoryId ||
      rewardTiersY === null ||
      rewardTierGroupY === null ||
      categoryOffset === undefined ||
      focusedCategoryRef.current === requestedCategoryId
    ) {
      return;
    }

    focusedCategoryRef.current = requestedCategoryId;
    setHighlightedCategoryId(requestedCategoryId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(
          0,
          rewardTiersY + rewardTierGroupY + categoryOffset - spacing.xxl,
        ),
        animated: true,
      });
    });
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedCategoryId(undefined);
      highlightTimeoutRef.current = undefined;
    }, 2400);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [categoryOffsets, requestedCategoryId, rewardTierGroupY, rewardTiersY]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  const edit = () => {
    if (cardId) {
      router.push({ pathname: '/card/[id]/edit', params: { id: cardId } });
    }
  };

  const moveCard = async (offset: -1 | 1) => {
    if (!cardId) return;
    const nextOrder = orderedCards.map(({ card }) => card.id);
    const currentIndex = nextOrder.indexOf(cardId);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= nextOrder.length) return;
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    const cardTypeById = new Map(orderedCards.map(({ card }) => [card.id, card.type] as const));
    await actions.setSettings({
      cardOrdering: {
        ...state.settings.cardOrdering,
        all: nextOrder,
        cashback: nextOrder.filter((id) => cardTypeById.get(id) === 'cashback'),
        miles: nextOrder.filter((id) => cardTypeById.get(id) === 'miles'),
      },
    });
  };

  const showCardNow = async () => {
    if (!cardId) return;
    await actions.setHiddenCards(state.hiddenCards.filter((entry) => entry.cardId !== cardId));
  };

  if (!projection) {
    return (
      <View style={styles.missingScreen}>
        <Stack.Screen options={{ title: 'Card' }} />
        <EmptyState
          title="Card not found"
          message="It may no longer be part of your tracked YNAB accounts."
          action={{ label: 'View cards', onPress: () => router.replace('/(tabs)/cards') }}
        />
      </View>
    );
  }

  const { card } = projection;
  const orderIndex = orderedCards.findIndex(({ card: orderedCard }) => orderedCard.id === card.id);
  const hiddenEntry = state.hiddenCards.find((entry) => (
    entry.cardId === card.id && new Date(entry.hiddenUntil).getTime() > Date.now()
  ));
  const overviewLabel = card.featured === false
    ? 'Not featured'
    : hiddenEntry
      ? `Hidden until ${formatHiddenUntil(hiddenEntry.hiddenUntil)}`
      : 'Shown';
  const overviewPillLabel = card.featured === false
    ? 'Not on Overview'
    : hiddenEntry
      ? 'Hidden until reset'
      : 'On Overview';
  const accountName = getCardAccountName(card, model.cacheEntry);
  const subcategories = [...(card.subcategories ?? [])].sort((left, right) => left.priority - right.priority);
  const blockCopy = projection.blockInfo
    ? [
        `${projection.blockInfo.sizes.map((size) => formatting.currencyCompact(size)).join('/')} earning blocks`,
        projection.blockInfo.blocksEarned !== null ? `${projection.blockInfo.blocksEarned} earned` : undefined,
        projection.blockInfo.uncountedEligibleSpend > 0
          ? `${formatting.currencyCompact(projection.blockInfo.uncountedEligibleSpend)} remainder not counted`
          : undefined,
      ].filter(Boolean).join(' · ')
    : undefined;
  const nativeReward = card.type === 'cashback'
    ? formatting.currencyExact(projection.reward.amount)
    : formatting.number(projection.reward.amount);
  const nativeRewardLabel = card.type === 'cashback'
    ? 'cashback earned'
    : `miles earned · ≈ ${formatting.currencyExact(projection.reward.dollars)}`;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Card',
          headerRight: () => (
            <Button
              variant="plain"
              size="small"
              onPress={edit}
              accessibilityLabel={`Edit ${card.name}`}
              accessibilityHint="Opens card settings"
              style={styles.headerButton}
            >
              Edit
            </Button>
          ),
        }}
      />
      <ScrollView
        ref={scrollViewRef}
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
            accessibilityLabel={`Refresh ${card.name}`}
          />
        )}
      >
        <View style={styles.detailHeading}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Title2 accessibilityRole="header">{card.name}</Title2>
              <Footnote color="secondary">
                {[card.issuer !== 'Unknown' ? card.issuer : undefined, accountName].filter(Boolean).join(' · ')}
              </Footnote>
            </View>
            <StatusPill
              label={overviewPillLabel}
              tone={card.featured === false || hiddenEntry ? 'inactive' : 'accent'}
            />
          </View>
          <SyncBadge
            state={model.syncState}
            label={model.syncLabel}
            onPress={model.canSync ? model.refresh : () => router.push('/settings')}
          />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroPeriod}>
              <Caption1 color="secondary" style={styles.eyebrow}>CURRENT PERIOD</Caption1>
              <Footnote color="secondary">{formatPeriod(projection.period)}</Footnote>
            </View>
            <StatusPill
              label={statusPresentation(projection.status).label}
              tone={statusPresentation(projection.status).tone}
            />
          </View>

          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${nativeReward} ${nativeRewardLabel}`}
          >
            <LargeTitle style={styles.rewardValue} accessible={false}>{nativeReward}</LargeTitle>
            <Body color="secondary" accessible={false}>{nativeRewardLabel}</Body>
          </View>

          <View style={styles.heroMetrics}>
            <MetricValue
              label="Spent"
              value={formatting.currencyCompact(projection.spend.total)}
              detail={projection.spend.counted !== projection.spend.total
                ? `${formatting.currencyCompact(projection.spend.counted)} counted`
                : undefined}
            />
            <MetricValue
              label="Eligible"
              value={formatting.currencyCompact(projection.spend.eligible)}
              align="right"
            />
          </View>

          {(projection.minimum.target || projection.maximum.target) ? (
            <View style={styles.progressStack}>
              {projection.minimum.target ? (
                <ProgressRail
                  value={projection.progress.minimumProgressSpend}
                  minimum={projection.minimum.target}
                  formatValue={formatting.currencyCompact}
                  label={`${card.name} minimum spend`}
                />
              ) : null}
              {projection.maximum.target ? (
                <ProgressRail
                  value={projection.progress.maximumProgressSpend}
                  maximum={projection.maximum.target}
                  formatValue={formatting.currencyCompact}
                  label={`${card.name} spending cap`}
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.heroFooter}>
            <Headline color={projection.status === 'capped' ? 'destructive' : projection.status === 'near_cap' || projection.status === 'building' || projection.status === 'unconfigured' ? 'attention' : 'positive'}>
              {projection.status === 'earning' || projection.status === 'open'
                ? 'Earning is on track.'
                : attentionCopy(projection, formatting)}
            </Headline>
            <Footnote color="secondary">
              {formatDaysRemaining(projection.daysRemaining, projection.resetsOn)}
            </Footnote>
            {blockCopy ? <Footnote color="secondary">{blockCopy}</Footnote> : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle
            title="Overview & order"
          />
          <View style={styles.overviewControlCard}>
            <ConfigRow label="Overview" value={overviewLabel} />
            <ConfigRow
              label="Card order"
              value={orderIndex >= 0 ? `${orderIndex + 1} of ${orderedCards.length}` : 'Not ordered'}
              showDivider={false}
            />
            <View style={styles.orderButtons}>
              <Button
                variant="tinted"
                size="small"
                disabled={orderIndex <= 0}
                onPress={() => void moveCard(-1)}
                accessibilityHint="Moves this card earlier on Overview and in card lists"
              >
                Move earlier
              </Button>
              <Button
                variant="tinted"
                size="small"
                disabled={orderIndex < 0 || orderIndex >= orderedCards.length - 1}
                onPress={() => void moveCard(1)}
                accessibilityHint="Moves this card later on Overview and in card lists"
              >
                Move later
              </Button>
              {hiddenEntry ? (
                <Button
                  variant="plain"
                  size="small"
                  onPress={() => void showCardNow()}
                  accessibilityHint="Restores this temporarily hidden card to Overview"
                >
                  Show now
                </Button>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle
            title="Earning setup"
            action={{ label: 'Edit', onPress: edit, accessibilityHint: 'Opens card settings' }}
          />
          <View style={styles.group}>
            <ConfigRow label="Reward type" value={card.type === 'cashback' ? 'Cashback' : 'Miles'} />
            <ConfigRow label="Rate" value={formatRate(card, formatting)} />
            <ConfigRow
              label="Minimum"
              value={(card.minimumSpend ?? 0) > 0 ? formatting.currencyCompact(card.minimumSpend!) : 'None'}
            />
            <ConfigRow
              label="Cap"
              value={(card.maximumSpend ?? 0) > 0 ? formatting.currencyCompact(card.maximumSpend!) : 'None'}
            />
            <ConfigRow
              label="Earning method"
              value={(card.earningBlockSize ?? 0) > 0
                ? `${formatting.currencyCompact(card.earningBlockSize!)} transaction blocks`
                : 'Exact transaction amount'}
            />
            <ConfigRow
              label="Cycle"
              value={card.billingCycle?.type === 'billing'
                ? `Resets monthly after day ${card.billingCycle.dayOfMonth ?? 1}`
                : 'Calendar month'}
            />
            <ConfigRow
              label="Promotion"
              value={card.promotionalPeriod
                ? `${card.promotionalPeriod.description || 'Active promotion'} · until ${formatResetDate(card.promotionalPeriod.endDate)}`
                : 'None'}
              showDivider={false}
            />
          </View>
        </View>

        <View
          style={styles.section}
          onLayout={(event: LayoutChangeEvent) => setRewardTiersY(event.nativeEvent.layout.y)}
        >
          <SectionTitle
            title="Reward tiers"
            subtitle={card.subcategoriesEnabled
              ? `${subcategories.length} YNAB flag ${subcategories.length === 1 ? 'tier' : 'tiers'}`
              : undefined}
          />
          {card.subcategoriesEnabled && subcategories.length > 0 ? (
            <View
              style={styles.group}
              onLayout={(event: LayoutChangeEvent) => (
                setRewardTierGroupY(event.nativeEvent.layout.y)
              )}
            >
              {subcategories.map((subcategory, index) => (
                <SubcategoryRow
                  key={subcategory.id}
                  subcategory={subcategory}
                  projection={projection}
                  formatting={formatting}
                  showDivider={index < subcategories.length - 1}
                  highlighted={subcategory.id === highlightedCategoryId}
                  onLayout={(event: LayoutChangeEvent) => {
                    const offset = event.nativeEvent.layout.y;
                    setCategoryOffsets((current) => (
                      current[subcategory.id] === offset
                        ? current
                        : { ...current, [subcategory.id]: offset }
                    ));
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.simpleRate}>
              <Title3>{formatRate(card, formatting)}</Title3>
              <Body color="secondary">
                Applied to eligible spend{card.earningBlockSize ? ` in ${formatting.currencyCompact(card.earningBlockSize)} transaction blocks` : ''}.
              </Body>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle
            title="Recent transactions"
            subtitle={cardTransactions.length > 0
              ? `${cardTransactions.length} most recent saved ${cardTransactions.length === 1 ? 'transaction' : 'transactions'}`
              : undefined}
          />
          {cardTransactions.length > 0 ? (
            <View style={styles.group}>
              {cardTransactions.map((transaction, index) => (
                <TransactionRow
                  key={transaction.transaction.id}
                  item={transaction}
                  currency={formatting.currencyCompact}
                  formatReward={(amount, dollars) => formatRewardForCard(card, amount, dollars, formatting)}
                  showDivider={index < cardTransactions.length - 1}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyTransactions}>
              <Body color="secondary">No saved transactions for this card yet.</Body>
              <Button
                variant="tinted"
                size="medium"
                onPress={model.canSync ? model.refresh : () => router.push('/settings')}
              >
                {model.canSync ? 'Sync now' : 'Check YNAB connection'}
              </Button>
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  missingScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nativeMetrics.screenGutter,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: 80,
    gap: spacing.xxxl,
  },
  headerButton: {
    marginHorizontal: -spacing.sm,
  },
  detailHeading: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    columnGap: spacing.lg,
    rowGap: spacing.sm,
  },
  titleCopy: {
    flex: 1,
    minWidth: 200,
    gap: spacing.xs,
  },
  hero: {
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.xl,
    borderRadius: radii.xlarge,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  heroTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    columnGap: spacing.lg,
    rowGap: spacing.sm,
  },
  heroPeriod: {
    gap: spacing.xs,
  },
  eyebrow: {
    letterSpacing: 0.7,
    fontWeight: '600',
  },
  rewardValue: {
    fontSize: 42,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    columnGap: spacing.xxl,
    rowGap: spacing.md,
  },
  heroFooter: {
    gap: spacing.xs,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.separator,
  },
  progressStack: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  group: {
    marginHorizontal: -spacing.xs,
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  overviewControlCard: {
    marginHorizontal: -spacing.xs,
    paddingBottom: spacing.md,
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  orderButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  configRow: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: spacing.xl,
    rowGap: spacing.xs,
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
  },
  configLabel: {
    flexShrink: 0,
  },
  configValue: {
    flex: 1,
    minWidth: 170,
    textAlign: 'right',
  },
  simpleRate: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  subcategoryRow: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  highlightedSubcategory: {
    backgroundColor: semanticColors.actionTint,
  },
  subcategoryHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  subcategoryIdentity: {
    flex: 1,
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  subcategoryCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  flagDot: {
    width: 11,
    height: 11,
    marginTop: 5,
    borderRadius: 6,
  },
  subcategoryMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: spacing.xxl,
    rowGap: spacing.md,
    paddingLeft: 23,
  },
  transactionRow: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  transactionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  transactionCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  transactionAmount: {
    flexShrink: 0,
    maxWidth: '47%',
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  transactionReward: {
    textAlign: 'right',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  blockTransactionLabel: {
    paddingLeft: 0,
  },
  emptyTransactions: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
});
