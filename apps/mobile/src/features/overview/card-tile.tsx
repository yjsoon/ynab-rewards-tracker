import React, { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Caption1, Footnote, Headline, Title3 } from '@/components/ios';
import type { CardFormatting } from '@/features/cards/presentation';
import { isPromotionalPeriodActive } from '@/features/cards/presentation';
import { semanticColors, withAlpha } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { TextColor } from '@/components/ios/Typography';
import {
  resolveCardSpendingTier,
  type CardDashboardProjection,
} from '@ynab-counter/app-core/rewards-engine';
import type { CreditCard, MonthlyQualificationBreakdown } from '@ynab-counter/app-core/storage';
import { CardSubcategoryBreakdown } from './subcategory-breakdown';
import { ZonesProgressBar } from './zones-progress-bar';

const NEAR_CAP_RATIO = 0.8;

type HeroVariant = 'cap-left' | 'cap-over' | 'min-left' | 'tier-left' | 'spent';

interface HeroModel {
  variant: HeroVariant;
  amount: number;
  tone: TextColor;
  suffix: string;
  label: string;
  weight: 'semibold' | 'medium';
}

function cardUsesBlocks(card: CreditCard): boolean {
  return Boolean(
    (typeof card.earningBlockSize === 'number' && card.earningBlockSize > 0) ||
      (card.subcategoriesEnabled &&
        card.subcategories?.some(
          (subcategory) =>
            typeof subcategory.milesBlockSize === 'number' && subcategory.milesBlockSize > 0,
        )),
  );
}

function activeMonthlyQualification(
  months: readonly MonthlyQualificationBreakdown[],
  asOf: string,
): MonthlyQualificationBreakdown | undefined {
  return months.find((month) => month.start <= asOf && month.end >= asOf)
    ?? months.find((month) => month.status === 'pending');
}

function presentCardMenu(params: {
  allowHideCard: boolean;
  onEdit: () => void;
  onHide: () => void;
  onOpen: () => void;
}): void {
  const actions = [
    { label: 'Edit settings', run: params.onEdit },
    ...(params.allowHideCard
      ? [{ label: 'Hide from dashboard', run: params.onHide }]
      : []),
    { label: 'View card details', run: params.onOpen },
  ];

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...actions.map((action) => action.label), 'Cancel'],
        cancelButtonIndex: actions.length,
      },
      (buttonIndex) => {
        const action = typeof buttonIndex === 'number' ? actions[buttonIndex] : undefined;
        action?.run();
      },
    );
    return;
  }

  Alert.alert('Card actions', undefined, [
    ...actions.map((action) => ({ text: action.label, onPress: action.run })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export interface CardTileProps {
  projection: CardDashboardProjection;
  formatting: CardFormatting;
  referenceDate?: Date;
  allowHideCard: boolean;
  isSubcategoryExpanded: boolean;
  onToggleSubcategories: () => void;
  onHideCard: (cardId: string, hiddenUntil: string) => void;
  onEdit: () => void;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
}

export function CardTile({
  projection,
  formatting,
  referenceDate,
  allowHideCard,
  isSubcategoryExpanded,
  onToggleSubcategories,
  onHideCard,
  onEdit,
  onOpen,
  style,
}: CardTileProps) {
  const { card } = projection;
  const [showRewardPeriodSpend, setShowRewardPeriodSpend] = useState(false);
  const promoActive = isPromotionalPeriodActive(card, referenceDate);
  const hasBlockRounding = cardUsesBlocks(card);
  const displayedSpend = hasBlockRounding ? projection.spend.counted : projection.spend.total;
  const hasMinimum = projection.minimum.target !== null;
  const minimumTarget = projection.minimum.target ?? 0;
  const hasMaximum = projection.maximum.target !== null;
  const maximumTarget = projection.maximum.target ?? 0;
  const minimumMet = projection.minimum.met !== false;
  const resolvedSpendingTier = resolveCardSpendingTier(card, projection.spend.total);
  const activeSpendingLevel = resolvedSpendingTier.activeLevel;
  const nextSpendingLevel = resolvedSpendingTier.hasNextSpendingTier
    ? resolvedSpendingTier.nextLevel
    : null;
  const hasUnlockedSpendingTier = (activeSpendingLevel?.spendThreshold ?? 0) > 0;
  const remainingToSpendingTier = nextSpendingLevel
    ? Math.max(0, nextSpendingLevel.spendThreshold - projection.spend.total)
    : 0;
  const exceeded = projection.maximum.reached && !nextSpendingLevel;
  const intermediateCapReached = projection.maximum.reached && Boolean(nextSpendingLevel);
  const nearCap =
    hasMaximum &&
    !nextSpendingLevel &&
    !exceeded &&
    maximumTarget > 0 &&
    displayedSpend / maximumTarget >= NEAR_CAP_RATIO;

  const qualificationFailed = projection.calculation.qualificationStatus === 'failed';
  const qualificationPending = projection.calculation.qualificationStatus === 'pending';
  const monthlyQualifications = projection.calculation.monthlyQualifications ?? [];
  const calculationAsOf = projection.calculationPeriod.asOf ?? projection.calculationPeriod.end;
  const qualificationMonth = activeMonthlyQualification(monthlyQualifications, calculationAsOf);
  const monthlyMinimumSpend = projection.calculation.monthlyMinimumSpend
    ?? card.rewardPeriod?.monthlyMinimumSpend
    ?? 0;
  const hasMonthlyMinimum = monthlyMinimumSpend > 0;
  const allMonthlyMinimumsMet = Boolean(
    card.rewardPeriod &&
    monthlyQualifications.length === card.rewardPeriod.monthCount &&
    monthlyQualifications.every((month) => month.status === 'met'),
  );
  const remainingToMaximum = hasMaximum ? Math.max(0, maximumTarget - displayedSpend) : 0;
  const exceededAmount = hasMaximum ? Math.max(0, displayedSpend - maximumTarget) : 0;
  const remainingToMinimum = hasMinimum ? projection.minimum.remaining ?? 0 : 0;
  const clampedProgress =
    hasMinimum && minimumTarget > 0
      ? Math.min(1, Math.max(0, projection.minimum.progress ?? 0))
      : 0;
  const progressPercent = Math.round(clampedProgress * 100);

  const heroVariant: HeroVariant = nextSpendingLevel
    ? 'tier-left'
    : hasMinimum && !minimumMet
      ? 'min-left'
      : hasMaximum && exceeded
        ? 'cap-over'
        : hasMaximum
          ? 'cap-left'
          : 'spent';
  const canToggleSpendView = Boolean(
    heroVariant === 'spent' && card.rewardPeriod && qualificationMonth,
  );
  const showingCurrentMonthSpend = canToggleSpendView && !showRewardPeriodSpend;
  const heroSpend = showingCurrentMonthSpend && qualificationMonth
    ? qualificationMonth.spend
    : displayedSpend;

  const hero: HeroModel = useMemo(() => {
    const capUrgent = heroVariant === 'cap-left' && nearCap;
    const tone: TextColor =
      heroVariant === 'cap-over'
        ? 'destructive'
        : heroVariant === 'tier-left'
          ? hasUnlockedSpendingTier ? 'positive' : 'attention'
        : heroVariant === 'min-left' || capUrgent
          ? 'attention'
          : heroVariant === 'cap-left' || (hasMinimum && minimumMet)
            ? 'positive'
            : 'primary';
    const amount =
      heroVariant === 'tier-left'
        ? remainingToSpendingTier
        : heroVariant === 'cap-left'
        ? remainingToMaximum
        : heroVariant === 'cap-over'
          ? exceededAmount
          : heroVariant === 'min-left'
            ? remainingToMinimum
            : heroSpend;
    const suffix =
      heroVariant === 'tier-left' || heroVariant === 'min-left' ? 'to go'
        : heroVariant === 'cap-left' ? 'left'
          : heroVariant === 'cap-over' ? 'over'
            : 'spent';
    const label =
      heroVariant === 'tier-left' && nextSpendingLevel
        ? `${formatting.currencyRounded(remainingToSpendingTier)} to go to the ${formatting.currencyRounded(nextSpendingLevel.spendThreshold)} tier`
        : heroVariant === 'cap-left'
        ? `${formatting.currencyRounded(remainingToMaximum)} left before the cap`
        : heroVariant === 'cap-over'
          ? `${formatting.currencyRounded(exceededAmount)} over the cap`
          : heroVariant === 'min-left'
            ? `${formatting.currencyRounded(remainingToMinimum)} more to meet the minimum`
            : `Spent ${formatting.currencyRounded(heroSpend)} ${showingCurrentMonthSpend ? 'this month' : 'this period'}`;
    return {
      variant: heroVariant,
      amount,
      tone,
      suffix,
      label,
      weight: heroVariant === 'spent' || heroVariant === 'cap-over' ? 'semibold' : 'medium',
    };
  }, [
    exceededAmount,
    formatting,
    hasMinimum,
    hasUnlockedSpendingTier,
    heroSpend,
    heroVariant,
    minimumMet,
    nearCap,
    nextSpendingLevel,
    remainingToMaximum,
    remainingToMinimum,
    remainingToSpendingTier,
    showingCurrentMonthSpend,
  ]);

  const earnedNumber = projection.reward.amount;
  const earnedDisplay = Math.round(earnedNumber).toLocaleString();
  const rewardChipTone: TextColor = exceeded || qualificationFailed
    ? 'destructive'
    : intermediateCapReached || qualificationPending || (hasMinimum && !minimumMet)
      ? 'attention'
      : card.type === 'cashback'
        ? 'positive'
        : 'action';
  const rewardChipColor = {
    destructive: semanticColors.capped,
    attention: semanticColors.attention,
    positive: semanticColors.positive,
    action: semanticColors.systemBlue,
  }[rewardChipTone];

  const heroLabel: string =
    hero.variant === 'tier-left' && nextSpendingLevel
      ? `${formatting.currencyRounded(nextSpendingLevel.spendThreshold)} tier`
      : hero.variant === 'cap-left' || hero.variant === 'cap-over'
      ? `${formatting.currencyRounded(maximumTarget)} cap`
      : hero.variant === 'min-left'
        ? `${formatting.currencyRounded(minimumTarget)} min`
        : showingCurrentMonthSpend ? 'This month' : 'This period';

  const daysRemaining = projection.daysRemaining;
  const daysTone: TextColor = daysRemaining <= 1
    ? 'destructive'
    : daysRemaining <= 3
      ? 'attention'
      : daysRemaining <= 7
        ? 'attention'
        : 'tertiary';
  const daysLabel = `${daysRemaining}d`;

  const blockCount = projection.blockInfo?.blocksEarned ?? null;
  const blockSize = projection.blockInfo?.sizes[0] ?? null;
  const showBlocks = Boolean(
    blockSize &&
      blockSize > 0 &&
      (blockCount !== null ? blockCount > 0 : (projection.blockInfo?.eligibleSpendBeforeBlocks ?? 0) > 0),
  );
  const blockCopy = showBlocks && blockSize && blockSize > 0
    ? `${blockCount !== null
        ? blockCount
        : Math.floor((projection.blockInfo?.eligibleSpendBeforeBlocks ?? 0) / blockSize)} × ${formatting.currencyRounded(blockSize)} blocks`
    : undefined;

  const heroNumberText =
    hero.variant === 'cap-left' || hero.variant === 'cap-over' ||
    hero.variant === 'min-left' || hero.variant === 'tier-left'
      ? formatting.currencyRounded(hero.amount)
      : formatting.currencyCompact(hero.amount);

  const spendMeta = intermediateCapReached
    ? 'Current level capped · Next tier can unlock more rewards'
    : hero.variant === 'spent'
      ? undefined
      : `Spent ${formatting.currencyRounded(displayedSpend)}`;
  const minimumMeta = hasMinimum && hero.variant !== 'min-left'
    ? minimumMet
      ? `Met ${formatting.currencyRounded(minimumTarget)} min`
      : `${progressPercent}% of ${formatting.currencyRounded(minimumTarget)} min`
    : undefined;
  const noLimitsMeta = !hasMinimum && !hasMaximum && !nextSpendingLevel;

  const borderTone = nextSpendingLevel
    ? {
        borderColor: hasUnlockedSpendingTier ? semanticColors.positive : semanticColors.attention,
        borderWidth: 1.5,
      }
    : exceeded || qualificationFailed
    ? { borderColor: semanticColors.capped, borderWidth: 1.5 }
    : nearCap
      ? { borderColor: semanticColors.attention, borderWidth: 1.5 }
      : { borderColor: semanticColors.separator, borderWidth: StyleSheet.hairlineWidth };

  const qualificationCopy = !card.rewardPeriod || !hasMonthlyMinimum || !qualificationMonth
    ? undefined
    : projection.calculation.qualificationStatus === 'failed'
      ? 'Period qualification failed'
      : projection.calculation.qualificationStatus === 'met'
        ? allMonthlyMinimumsMet
          ? `All ${card.rewardPeriod.monthCount} monthly minimums met`
          : `This month: ${formatting.currencyRounded(qualificationMonth.spend)} of ${formatting.currencyRounded(monthlyMinimumSpend)} · met`
        : `This month: ${formatting.currencyRounded(qualificationMonth.spend)} of ${formatting.currencyRounded(monthlyMinimumSpend)}`;
  const qualificationTone: TextColor = projection.calculation.qualificationStatus === 'failed'
    ? 'destructive'
    : projection.calculation.qualificationStatus === 'met'
      ? 'positive'
      : 'attention';

  return (
    <View style={[styles.tile, borderTone, style]}>
      <Pressable
        onPress={() => presentCardMenu({
          allowHideCard,
          onEdit,
          onHide: () => onHideCard(card.id, projection.resetsOn),
          onOpen,
        })}
        accessibilityRole="button"
        accessibilityLabel={`${card.name} actions`}
        hitSlop={8}
        style={({ pressed }) => [styles.kebab, pressed && styles.pressed]}
      >
        <SymbolView
          name="ellipsis"
          size={16}
          tintColor={semanticColors.tertiaryLabel}
          accessibilityElementsHidden
        />
      </Pressable>
      <Pressable
        onPress={onOpen}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${card.name}, ${earnedDisplay} ${card.type === 'cashback' ? 'cashback' : 'miles'} earned, ${hero.label}${intermediateCapReached ? ', current level capped; next tier can unlock more rewards' : ''}${blockCopy ? `, ${blockCopy}` : ''}`}
        accessibilityHint="Opens card details"
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        <View style={styles.header} accessibilityElementsHidden>
          <Headline numberOfLines={1} style={styles.cardName}>{card.name}</Headline>
          <View style={styles.headerTrailing}>
            {promoActive ? (
              <View style={styles.promoPill}>
                <SymbolView
                  name="sparkles"
                  size={11}
                  tintColor={semanticColors.systemPurple}
                />
                <Caption1 color="action" style={styles.promoText}>Promo</Caption1>
              </View>
            ) : null}
            <View style={styles.rewardChip}>
              <SymbolView
                name={card.type === 'cashback' ? 'dollarsign.circle.fill' : 'airplane'}
                size={14}
                tintColor={rewardChipColor}
                style={styles.rewardIcon}
              />
              <Footnote color={rewardChipTone} style={styles.rewardChipText}>
                {earnedDisplay}
              </Footnote>
            </View>
          </View>
        </View>

        <View style={styles.heroRow} accessibilityElementsHidden>
          {canToggleSpendView ? (
            <Pressable
              onPress={() => setShowRewardPeriodSpend((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={showingCurrentMonthSpend
                ? 'Showing this month spend. Show full reward period spend'
                : 'Showing full reward period spend. Show this month spend'}
              hitSlop={8}
              style={styles.heroLabelHit}
            >
              <Caption1 color="secondary" style={[styles.heroLabel, styles.heroLabelToggle]}>
                {heroLabel}
              </Caption1>
            </Pressable>
          ) : (
            <Caption1 color="secondary" style={styles.heroLabel}>
              {heroLabel}
            </Caption1>
          )}
          <View style={styles.heroValueRow}>
            {hero.variant === 'min-left' || hero.variant === 'tier-left' ? (
              <SymbolView
                name="arrow.up.right"
                size={13}
                tintColor={hero.variant === 'tier-left' && hasUnlockedSpendingTier
                  ? semanticColors.positive
                  : semanticColors.attention}
                style={styles.heroGlyph}
              />
            ) : hero.variant === 'cap-left' ? (
              <SymbolView
                name="gauge"
                size={13}
                tintColor={semanticColors.positive}
                style={styles.heroGlyph}
              />
            ) : hero.variant === 'cap-over' ? (
              <SymbolView
                name="exclamationmark.octagon"
                size={13}
                tintColor={semanticColors.destructive}
                style={styles.heroGlyph}
              />
            ) : null}
            <Title3
              color={hero.tone}
              style={[styles.heroNumber, hero.weight === 'medium' && styles.heroNumberMedium]}
            >
              {heroNumberText}
            </Title3>
            <Caption1
              color={hero.variant === 'spent' ? 'secondary' : hero.tone}
              style={styles.heroSuffix}
            >
              {hero.suffix}
            </Caption1>
          </View>
        </View>

        <ZonesProgressBar
          totalSpend={projection.spend.total}
          minimumSpend={nextSpendingLevel?.spendThreshold ?? (hasMinimum ? projection.minimum.target : null)}
          maximumSpend={nextSpendingLevel ? null : (hasMaximum ? projection.maximum.target : null)}
          minimumProgressSpend={nextSpendingLevel
            ? projection.spend.total
            : projection.progress.minimumProgressSpend}
          maximumProgressSpend={nextSpendingLevel
            ? undefined
            : projection.progress.maximumProgressSpend}
          fillTone={nextSpendingLevel
            ? hasUnlockedSpendingTier ? 'positive' : 'attention'
            : undefined}
          height={8}
          formatAmount={formatting.currencyRounded}
          accessible={false}
        />

        <View style={styles.metaRow} accessibilityElementsHidden>
          <View style={styles.metaCopy}>
            {spendMeta || minimumMeta || noLimitsMeta ? (
              <Footnote color="secondary" numberOfLines={2}>
                {spendMeta ? <Footnote color="secondary">{spendMeta}</Footnote> : null}
                {spendMeta && minimumMeta ? <Footnote color="tertiary"> · </Footnote> : null}
                {minimumMeta ? (
                  <Footnote color={minimumMet ? 'positive' : 'attention'}>{minimumMeta}</Footnote>
                ) : null}
                {noLimitsMeta ? <Footnote color="secondary" style={styles.italic}>No spend limits</Footnote> : null}
              </Footnote>
            ) : null}
          </View>
          <Footnote color={daysTone} style={styles.tabular}>
            {daysLabel}
          </Footnote>
        </View>

        {qualificationCopy ? (
          <Caption1 color={qualificationTone} style={styles.qualification} accessibilityElementsHidden>
            {qualificationCopy}
          </Caption1>
        ) : null}

        {blockCopy ? (
          <Caption1 color="tertiary" style={styles.tabular} accessibilityElementsHidden>
            {blockCopy}
          </Caption1>
        ) : null}
      </Pressable>

      {card.subcategoriesEnabled && projection.rewardCategories.length > 0 ? (
        <View style={styles.footerSection}>
          <CardSubcategoryBreakdown
            categories={projection.rewardCategories}
            formatting={formatting}
            isExpanded={isSubcategoryExpanded}
            onToggleExpanded={onToggleSubcategories}
          />
        </View>
      ) : null}

      {allowHideCard && exceeded ? (
        <Pressable
          onPress={() => onHideCard(card.id, projection.resetsOn)}
          accessibilityRole="button"
          accessibilityLabel={`Hide ${card.name} until next cycle`}
          style={({ pressed }) => [styles.hideButton, pressed && styles.pressed]}
        >
          <Caption1 color="secondary" style={styles.hideButtonText} accessible={false}>
            Hide until next cycle
          </Caption1>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    position: 'relative',
    borderRadius: radii.xlarge,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    overflow: 'hidden',
  },
  kebab: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
    minWidth: nativeMetrics.minimumTouchTarget,
    minHeight: nativeMetrics.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.separator,
    borderBottomLeftRadius: radii.medium,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  pressable: {
    padding: spacing.lg,
    paddingRight: nativeMetrics.minimumTouchTarget,
    gap: spacing.md,
  },
  footerSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  pressed: {
    opacity: interaction.subtlePressedOpacity,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    minWidth: 120,
  },
  headerTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  promoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: withAlpha('#AF52DE', '1F'),
  },
  promoText: {
    color: semanticColors.systemPurple,
    fontWeight: '600',
  },
  rewardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  rewardIcon: {
    flexShrink: 0,
  },
  rewardChipText: {
    fontWeight: '600',
  },
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  heroLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  heroLabelHit: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    marginVertical: -spacing.sm,
  },
  heroLabelToggle: {
    textDecorationLine: 'underline',
  },
  qualification: {
    fontWeight: '600',
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  heroGlyph: {
    alignSelf: 'center',
    marginRight: spacing.xxs,
  },
  heroNumber: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  heroNumberMedium: {
    fontWeight: '500',
  },
  heroSuffix: {
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  metaCopy: {
    flex: 1,
    minWidth: 0,
  },
  italic: {
    fontStyle: 'italic',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  hideButton: {
    alignSelf: 'stretch',
    minHeight: nativeMetrics.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.separator,
    borderRadius: radii.small,
  },
  hideButtonText: {
    fontWeight: '600',
  },
});
