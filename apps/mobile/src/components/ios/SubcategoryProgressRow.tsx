import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Body, Caption2, Footnote } from './Typography';
import { semanticColors } from '../../theme/semanticColors';

// Flag color hex values (matching YNAB flag colors)
const FLAG_COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  unflagged: '#6b7280',
};

const MAXED_COLOR = FLAG_COLOR_HEX.red;

function getFlagHex(flagColor?: string | null): string {
  if (!flagColor) return FLAG_COLOR_HEX.unflagged;
  const normalised = flagColor.toLowerCase();
  return FLAG_COLOR_HEX[normalised] ?? FLAG_COLOR_HEX.unflagged;
}

interface SubcategoryProgressRowProps {
  name: string;
  flagColor?: string | null;
  totalSpend: number;
  maximumSpend?: number | null;
  rewardEarned: number;
  rewardEarnedDollars?: number;
  maximumSpendExceeded?: boolean;
  formatCurrency: (value: number) => string;
}

/**
 * A subcategory row that doubles as a progress bar.
 * The background fills from left to right based on spending progress towards the cap.
 * Uses low-opacity flag color for contrast while maintaining text readability.
 */
export function SubcategoryProgressRow({
  name,
  flagColor,
  totalSpend,
  maximumSpend,
  rewardEarned,
  rewardEarnedDollars,
  maximumSpendExceeded,
  formatCurrency,
}: SubcategoryProgressRowProps) {
  const color = getFlagHex(flagColor);

  // Calculate progress percentage (0-100)
  const progress = maximumSpend && maximumSpend > 0
    ? Math.min(100, (totalSpend / maximumSpend) * 100)
    : 0;

  const rewardValue = rewardEarnedDollars ?? rewardEarned ?? 0;

  // Build accessibility label
  const accessibilityLabel = maximumSpend && maximumSpend > 0
    ? `${name}, earned ${formatCurrency(rewardValue)}, spent ${formatCurrency(totalSpend)} of ${formatCurrency(maximumSpend)} cap${maximumSpendExceeded ? ', maxed out' : ''}`
    : `${name}, earned ${formatCurrency(rewardValue)}, spent ${formatCurrency(totalSpend)}`;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Progress fill background */}
      <View
        style={[
          styles.progressFill,
          {
            width: `${progress}%`,
            backgroundColor: color,
          },
        ]}
      />

      {/* Colored left border accent */}
      <View style={[styles.leftBorder, { backgroundColor: color }]} />

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.leftContent}>
          {/* Colored dot indicator */}
          <View
            style={[
              styles.dot,
              { backgroundColor: color },
            ]}
          />
          <View style={styles.textContent}>
            {/* Name and amount spent on same line */}
            <View style={styles.titleRow}>
              <Body style={styles.name}>{name}</Body>
              <Body style={styles.bullet}> {'\u2022'} </Body>
              <Footnote style={styles.reward} color="primary">
                {formatCurrency(totalSpend)}
              </Footnote>
            </View>
            {/* Cap info and rebate */}
            <Caption2 color="secondary">
              {maximumSpend && maximumSpend > 0 ? (
                <>
                  Cap {formatCurrency(maximumSpend)}
                  <Text style={maximumSpendExceeded ? styles.maxedText : undefined}>
                    {' '}({Math.round(progress)}%)
                  </Text>
                </>
              ) : null}
              {(rewardValue > 0 || !(maximumSpend && maximumSpend > 0)) && (
                <>
                  {maximumSpend && maximumSpend > 0 ? ' · ' : ''}
                  ${Math.round(rewardValue)} rebate
                </>
              )}
            </Caption2>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 4,
    minHeight: 56,
    // Subtle border using the separator color
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.separator,
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    opacity: 0.15, // Low opacity for contrast
  },
  leftBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  textContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  name: {
    fontWeight: '500',
  },
  bullet: {
    opacity: 0.5,
  },
  reward: {
    fontWeight: '600',
  },
  maxedText: {
    color: MAXED_COLOR,
    fontWeight: '500',
  },
});
