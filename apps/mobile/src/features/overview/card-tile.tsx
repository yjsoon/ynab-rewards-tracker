import React, { useMemo } from 'react';
import {
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
import { interaction, radii, spacing } from '@/theme/tokens';
import type { TextColor } from '@/components/ios/Typography';
import {
  resolveCardSpendingTier,
  type CardDashboardProjection,
} from '@ynab-counter/app-core/rewards-engine';
import type { CreditCard } from '@ynab-counter/app-core/storage';
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

export interface CardTileProps {
  projection: CardDashboardProjection;
  formatting: CardFormatting;
  referenceDate?: Date;
  allowHideCard: boolean;
  isSubcategoryExpanded: boolean;
  onToggleSubcategories: () => void;
  onHideCard: (cardId: string, hiddenUntil: string) => void;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The web dashboard's card tile, adapted for a native touch target: reward
 * chip, hero number ("X to go / left / over / spent"), zone-coloured progress
 * bar, spend meta row, block copy, and an expandable category breakdown.
 */
export function CardTile({
  projection,
  formatting,
  referenceDate,
  allowHideCard,
  isSubcategoryExpanded,
  onToggleSubcategories,
  onHideCard,
  onOpen,
  style,
}: CardTileProps) {
  const { card } = projection;
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
  const nextTierCategoryMaximums = nextSpendingLevel
    ? new Map(
        resolveCardSpendingTier(card, nextSpendingLevel.spendThreshold)
          .effectiveCard.subcategories?.map((subcategory) => [
            subcategory.id,
            subcategory.maximumSpend ?? null,
          ] as const) ?? [],
      )
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

  const remainingToMaximum = hasMaximum ? Math.max(0, maximumTarget - displayedSpend) : 0;
  const exceededAmount = hasMaximum ? Math.max(0, displayedSpend - maximumTarget) : 0;
  const remainingToMinimum = hasMinimum ? Math.max(0, minimumTarget - projection.spend.total) : 0;
  const clampedProgress =
    hasMinimum && minimumTarget > 0
      ? Math.min(1, Math.max(0, projection.spend.total / minimumTarget))
      : 0;
  const progressPercent = Math.round(clampedProgress * 100);

  const hero: HeroModel = useMemo(() => {
    const variant: HeroVariant = nextSpendingLevel
      ? 'tier-left'
      : hasMinimum && !minimumMet
        ? 'min-left'
        : hasMaximum && exceeded
          ? 'cap-over'
          : hasMaximum
            ? 'cap-left'
            : 'spent';
    const capUrgent = variant === 'cap-left' && nearCap;
    const tone: TextColor =
      variant === 'cap-over'
        ? 'destructive'
        : variant === 'tier-left'
          ? hasUnlockedSpendingTier ? 'positive' : 'attention'
        : variant === 'min-left' || capUrgent
          ? 'attention'
          : variant === 'cap-left' || (hasMinimum && minimumMet)
            ? 'positive'
            : 'primary';
    const amount =
      variant === 'tier-left'
        ? remainingToSpendingTier
        : variant === 'cap-left'
        ? remainingToMaximum
        : variant === 'cap-over'
          ? exceededAmount
          : variant === 'min-left'
            ? remainingToMinimum
            : displayedSpend;
    const suffix =
      variant === 'tier-left' || variant === 'min-left' ? 'to go'
        : variant === 'cap-left' ? 'left'
          : variant === 'cap-over' ? 'over'
            : 'spent';
    const label =
      variant === 'tier-left' && nextSpendingLevel
        ? `${formatting.currencyRounded(remainingToSpendingTier)} to go to the ${formatting.currencyRounded(nextSpendingLevel.spendThreshold)} tier`
        : variant === 'cap-left'
        ? `${formatting.currencyRounded(remainingToMaximum)} left before the cap`
        : variant === 'cap-over'
          ? `${formatting.currencyRounded(exceededAmount)} over the cap`
          : variant === 'min-left'
            ? `${formatting.currencyRounded(remainingToMinimum)} more to meet the minimum`
            : `Spent ${formatting.currencyRounded(displayedSpend)} this period`;
    return {
      variant,
      amount,
      tone,
      suffix,
      label,
      weight: variant === 'spent' || variant === 'cap-over' ? 'semibold' : 'medium',
    };
  }, [
    displayedSpend,
    exceeded,
    exceededAmount,
    formatting,
    hasMaximum,
    hasMinimum,
    hasUnlockedSpendingTier,
    minimumMet,
    nearCap,
    nextSpendingLevel,
    remainingToMaximum,
    remainingToMinimum,
    remainingToSpendingTier,
  ]);

  const earnedNumber = projection.reward.amount;
  const earnedDisplay = Math.round(earnedNumber).toLocaleString();
  const rewardChipTone: TextColor = exceeded
    ? 'destructive'
    : intermediateCapReached
      ? 'attention'
    : hasMinimum && !minimumMet
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
      ? `Next · ${formatting.currencyRounded(nextSpendingLevel.spendThreshold)} tier`
      : hero.variant === 'cap-left' || hero.variant === 'cap-over'
      ? `${formatting.currencyRounded(maximumTarget)} cap`
      : hero.variant === 'min-left'
        ? `${formatting.currencyRounded(minimumTarget)} min`
        : 'This period';

  const daysRemaining = projection.daysRemaining;
  const daysTone: TextColor = daysRemaining <= 1
    ? 'destructive'
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
    : exceeded
    ? { borderColor: semanticColors.capped, borderWidth: 1.5 }
    : nearCap
      ? { borderColor: semanticColors.attention, borderWidth: 1.5 }
      : { borderColor: semanticColors.separator, borderWidth: StyleSheet.hairlineWidth };

  return (
    <View style={[styles.tile, borderTone, style]}>
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
          <Caption1 color="secondary" style={styles.heroLabel}>
            {heroLabel}
          </Caption1>
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
            currentTierThreshold={activeSpendingLevel?.spendThreshold ?? null}
            formatting={formatting}
            isExpanded={isSubcategoryExpanded}
            nextTierCategoryMaximums={nextTierCategoryMaximums}
            nextTierThreshold={nextSpendingLevel?.spendThreshold ?? null}
            onToggleExpanded={onToggleSubcategories}
          />
        </View>
      ) : null}

      {allowHideCard && exceeded ? (
        <Pressable
          onPress={() => onHideCard(card.id, projection.period.end)}
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
    borderRadius: radii.xlarge,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    overflow: 'hidden',
  },
  pressable: {
    padding: spacing.lg,
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
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  hideButtonText: {
    fontWeight: '600',
  },
});
