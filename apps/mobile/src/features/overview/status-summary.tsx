import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Caption1, Footnote } from '@/components/ios';
import type { CardFormatting } from '@/features/cards/presentation';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { CardDashboardProjection } from '@ynab-counter/app-core/rewards-engine';

import {
  summariseDashboardStatus,
  type DashboardStatusSlot,
} from './status-summary-model';

export interface HiddenCardEntry {
  cardId: string;
  name: string;
  hiddenUntil: string;
}

type SlotColor = 'sky' | 'green' | 'amber' | 'red';

const SLOT_COLORS = {
  sky: semanticColors.systemBlue,
  green: semanticColors.positive,
  amber: semanticColors.attention,
  red: semanticColors.capped,
} as const;

type SummarySlot = {
  key: DashboardStatusSlot;
  describe: (count: number) => string;
  color: SlotColor;
};

const STATUS_SLOTS: SummarySlot[] = [
  {
    key: 'qualification-failed',
    describe: (count) => `${count} failed qualification`,
    color: 'red',
  },
  {
    key: 'below-minimum',
    describe: (count) => `${count} below minimum spend`,
    color: 'sky',
  },
  {
    key: 'earning',
    describe: (count) => `${count} earning rewards`,
    color: 'green',
  },
  {
    key: 'near-cap',
    describe: (count) => `${count} near cap`,
    color: 'amber',
  },
  {
    key: 'at-cap',
    describe: (count) => `${count} at cap`,
    color: 'red',
  },
];

export interface StatusSummaryProps {
  projections: CardDashboardProjection[];
  earnedDollars: number;
  formatting: CardFormatting;
  hiddenCards?: HiddenCardEntry[];
  onUnhideCard?: (cardId: string) => void;
  onUnhideAll?: () => void;
}

export function StatusSummary({
  projections,
  earnedDollars,
  formatting,
  hiddenCards = [],
  onUnhideCard,
  onUnhideAll,
}: StatusSummaryProps) {
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const counts = summariseDashboardStatus(projections);

  const showHidden = hiddenCards.length > 0 && Boolean(onUnhideCard);
  const earnedLabel = `≈ ${formatting.currencyRounded(earnedDollars)} earned this period`;

  return (
    <View style={styles.container}>
      <View style={styles.strip}>
        <View
          style={styles.dotsRow}
          accessible
          accessibilityRole="summary"
          accessibilityLabel={[
            STATUS_SLOTS.map((slot) => slot.describe(counts[slot.key])).join(', '),
            earnedLabel,
          ].join('. ')}
        >
          {STATUS_SLOTS.map((slot, index) => {
            const count = counts[slot.key];
            return (
              <React.Fragment key={slot.key}>
                {index > 0 ? <Footnote color="tertiary" accessible={false}>/</Footnote> : null}
                <View style={styles.dotSlot} accessibilityElementsHidden>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: SLOT_COLORS[slot.color] },
                      count === 0 && styles.dotDimmed,
                    ]}
                  />
                  <Footnote
                    color={count === 0 ? 'tertiary' : 'primary'}
                    style={[
                      count > 0 && { color: SLOT_COLORS[slot.color] },
                      styles.tabular,
                    ]}
                  >
                    {count}
                  </Footnote>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {showHidden ? (
          <Pressable
            onPress={() => setHiddenOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`${hiddenCards.length} hidden ${hiddenCards.length === 1 ? 'card' : 'cards'}`}
            accessibilityHint={hiddenOpen ? 'Collapses hidden cards' : 'Shows hidden cards'}
            accessibilityState={{ expanded: hiddenOpen }}
            style={({ pressed }) => [styles.hiddenButton, pressed && styles.pressed]}
          >
            <SymbolView
              name="eye.slash"
              size={11}
              tintColor={semanticColors.secondaryLabel}
              accessibilityElementsHidden
            />
            <Caption1 color="secondary" style={styles.hiddenLabel} accessible={false}>
              {hiddenCards.length} hidden
            </Caption1>
            <SymbolView
              name="chevron.down"
              size={9}
              tintColor={semanticColors.tertiaryLabel}
              style={hiddenOpen && styles.chevronOpen}
              accessibilityElementsHidden
            />
          </Pressable>
        ) : null}

        <Footnote color="tertiary" style={[styles.earned, styles.tabular]} accessible={false}>
          {earnedLabel}
        </Footnote>
      </View>

      {showHidden && hiddenOpen ? (
        <View style={styles.hiddenPanel}>
          <Caption1 color="secondary" accessible={false}>
            Hidden until next cycle:
          </Caption1>
          <View style={styles.chips}>
            {hiddenCards.map((entry) => (
              <Pressable
                key={entry.cardId}
                onPress={() => onUnhideCard?.(entry.cardId)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${entry.name} again`}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              >
                <Caption1 color="secondary" numberOfLines={1} style={styles.chipName} accessible={false}>
                  {entry.name}
                </Caption1>
                <SymbolView
                  name="xmark"
                  size={9}
                  tintColor={semanticColors.tertiaryLabel}
                  accessibilityElementsHidden
                />
              </Pressable>
            ))}
          </View>
          {hiddenCards.length > 1 && onUnhideAll ? (
            <Pressable
              onPress={onUnhideAll}
              accessibilityRole="button"
              accessibilityLabel="Show all hidden cards"
              style={({ pressed }) => [styles.showAll, pressed && styles.pressed]}
            >
              <Caption1 color="action" accessible={false}>Show all</Caption1>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.sm,
  },
  dotSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotDimmed: {
    opacity: 0.35,
  },
  hiddenButton: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: -spacing.sm,
  },
  hiddenLabel: {
    fontWeight: '600',
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  earned: {
    marginLeft: 'auto',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  hiddenPanel: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.tertiarySystemFill,
  },
  chipName: {
    flexShrink: 1,
  },
  showAll: {
    alignSelf: 'flex-start',
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
