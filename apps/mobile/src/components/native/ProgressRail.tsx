import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Caption1 } from '../ios/Typography';
import { semanticColors } from '../../theme/semanticColors';
import { nativeMetrics, radii, spacing } from '../../theme/tokens';

export interface ProgressRailProps {
  /** Current spend in the same unit as minimum and maximum. */
  value: number;
  minimum?: number | null;
  maximum?: number | null;
  label?: string;
  formatValue?: (value: number) => string;
  showLegend?: boolean;
  accessible?: boolean;
  style?: StyleProp<ViewStyle>;
}

function finiteNonNegative(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function defaultFormatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * A single spend rail with explicit minimum and cap semantics.
 */
export function ProgressRail({
  value,
  minimum,
  maximum,
  label = 'Spend progress',
  formatValue = defaultFormatValue,
  showLegend = true,
  accessible = true,
  style,
}: ProgressRailProps) {
  const current = finiteNonNegative(value) ?? 0;
  const minimumValue = finiteNonNegative(minimum);
  const maximumValue = finiteNonNegative(maximum);
  const hasMinimum = typeof minimumValue === 'number' && minimumValue > 0;
  const hasMaximum = typeof maximumValue === 'number' && maximumValue > 0;
  const hasBoundary = hasMinimum || hasMaximum;

  const rangeMaximum = hasMaximum
    ? maximumValue
    : hasMinimum
      ? minimumValue
      : Math.max(current, 1);
  const progress = hasBoundary
    ? Math.max(0, Math.min(1, current / rangeMaximum))
    : 0;
  const progressPercent = progress * 100;
  const minimumPercent = hasMinimum && hasMaximum
    ? Math.max(0, Math.min(100, (minimumValue / maximumValue) * 100))
    : undefined;
  const minimumMet = hasMinimum && current >= minimumValue;
  const capped = hasMaximum && current >= maximumValue;

  let stateText: string;
  if (capped) {
    stateText = `${formatValue(current)} spent, cap of ${formatValue(maximumValue)} reached`;
  } else if (hasMinimum && !minimumMet) {
    stateText = `${formatValue(current)} of ${formatValue(minimumValue)} minimum`;
  } else if (hasMinimum && hasMaximum) {
    stateText = `minimum met, ${formatValue(current)} of ${formatValue(maximumValue)} cap`;
  } else if (hasMinimum) {
    stateText = `${formatValue(current)} spent, minimum met`;
  } else if (hasMaximum) {
    stateText = `${formatValue(current)} of ${formatValue(maximumValue)} cap`;
  } else {
    stateText = `${formatValue(current)} tracked`;
  }

  return (
    <View
      style={[styles.container, style]}
      accessible={accessible}
      accessibilityRole={accessible ? (hasBoundary ? 'progressbar' : 'text') : undefined}
      accessibilityLabel={accessible ? (hasBoundary ? label : `${label}, ${stateText}`) : undefined}
      accessibilityValue={
        accessible && hasBoundary
          ? {
              min: 0,
              max: rangeMaximum,
              now: Math.min(current, rangeMaximum),
              text: stateText,
            }
          : undefined
      }
    >
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${progressPercent}%` },
            capped && styles.cappedFill,
          ]}
        />

        {typeof minimumPercent === 'number' && minimumPercent > 0 && minimumPercent < 100 ? (
          <View
            style={[
              styles.minimumMarker,
              { left: `${minimumPercent}%` },
              minimumMet && styles.minimumMetMarker,
            ]}
          />
        ) : null}

        {hasMaximum ? (
          <View style={[styles.capMarker, capped && styles.cappedMarker]} />
        ) : null}

      </View>

      {showLegend && (hasMinimum || hasMaximum) ? (
        <View
          style={styles.legend}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {hasMinimum ? (
            <Caption1
              color={minimumMet ? 'positive' : 'tertiary'}
              style={styles.legendText}
            >
              Minimum {formatValue(minimumValue)}{minimumMet ? ' met' : ''}
            </Caption1>
          ) : null}
          {hasMaximum ? (
            <Caption1
              color={capped ? 'destructive' : 'tertiary'}
              style={[styles.legendText, !hasMinimum && styles.capLegendOnly]}
            >
              Cap {formatValue(maximumValue)}{capped ? ' reached' : ''}
            </Caption1>
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
  track: {
    position: 'relative',
    height: nativeMetrics.railHeight,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.progressTrack,
  },
  fill: {
    height: nativeMetrics.railHeight,
    maxWidth: '100%',
    borderRadius: radii.pill,
    backgroundColor: semanticColors.action,
  },
  cappedFill: {
    backgroundColor: semanticColors.capped,
  },
  minimumMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: nativeMetrics.railHeight + 6,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: semanticColors.secondaryLabel,
  },
  minimumMetMarker: {
    backgroundColor: semanticColors.positive,
  },
  capMarker: {
    position: 'absolute',
    top: -2,
    right: -1,
    width: 2,
    height: nativeMetrics.railHeight + 4,
    borderRadius: 1,
    backgroundColor: semanticColors.secondaryLabel,
  },
  cappedMarker: {
    backgroundColor: semanticColors.capped,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  legendText: {
    fontVariant: ['tabular-nums'],
  },
  capLegendOnly: {
    marginLeft: 'auto',
  },
});
