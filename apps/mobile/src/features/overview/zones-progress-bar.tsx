import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { semanticColors } from '@/theme';
import { nativeMetrics, radii } from '@/theme/tokens';

const NEAR_CAP_RATIO = 0.8;

type SpendingZone = 'neutral' | 'pending' | 'earning' | 'nearing' | 'exceeded';

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function spendingZone(params: {
  hasMinimum: boolean;
  hasMaximum: boolean;
  minimumMet: boolean;
  maximumExceeded: boolean;
  nearingMaximum: boolean;
}): SpendingZone {
  if (!params.hasMinimum && !params.hasMaximum) {
    return 'neutral';
  }
  if (params.maximumExceeded) {
    return 'exceeded';
  }
  if (params.minimumMet && params.nearingMaximum) {
    return 'nearing';
  }
  if (params.minimumMet) {
    return 'earning';
  }
  return 'pending';
}

function zoneFillColor(zone: SpendingZone) {
  switch (zone) {
    case 'exceeded':
      return semanticColors.capped;
    case 'nearing':
      return semanticColors.attention;
    case 'earning':
      return semanticColors.positive;
    case 'pending':
      return semanticColors.systemYellow;
    case 'neutral':
      return semanticColors.action;
  }
}

export interface ZonesProgressBarProps {
  totalSpend: number;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  minimumProgressSpend?: number;
  maximumProgressSpend?: number;
  height?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The web dashboard's zone-aware spend bar: yellow while climbing to the
 * minimum, green while earning, orange nearing the cap, red past it, with
 * threshold markers at the minimum (grey) and cap (red).
 */
export function ZonesProgressBar({
  totalSpend,
  minimumSpend,
  maximumSpend,
  minimumProgressSpend,
  maximumProgressSpend,
  height = nativeMetrics.railHeight,
  accessible = true,
  accessibilityLabel,
  style,
}: ZonesProgressBarProps) {
  const hasMinimum = finitePositive(minimumSpend);
  const hasMaximum = finitePositive(maximumSpend);
  const hasLimits = hasMinimum || hasMaximum;
  const spendForMinimum = minimumProgressSpend ?? totalSpend;
  const spendForMaximum = maximumProgressSpend ?? totalSpend;

  const minimumMet = !hasMinimum || spendForMinimum >= minimumSpend;
  const maximumExceeded = hasMaximum && spendForMaximum >= maximumSpend;
  const nearingMaximum = hasMaximum && spendForMaximum >= maximumSpend * NEAR_CAP_RATIO;
  const zone = spendingZone({ hasMinimum, hasMaximum, minimumMet, maximumExceeded, nearingMaximum });

  const progressPercent = hasMaximum
    ? Math.min(100, (spendForMaximum / maximumSpend) * 100)
    : hasMinimum
      ? Math.min(100, (spendForMinimum / minimumSpend) * 100)
      : 0;
  const roundedPercent = Math.round(progressPercent);
  const zeroProgress = hasLimits && progressPercent === 0;
  const markerHeight = height + 6;
  const minimumPosition = hasMinimum && hasMaximum
    ? Math.min(100, (minimumSpend / maximumSpend) * 100)
    : hasMinimum
      ? 100
      : undefined;
  const maximumPosition = hasMaximum ? 100 : undefined;

  const stateText =
    zone === 'exceeded'
      ? maximumExceeded && spendForMaximum > maximumSpend
        ? `Spending cap exceeded by ${spendForMaximum - maximumSpend}`
        : 'Spending cap reached'
      : zone === 'nearing'
        ? `Nearing cap: ${roundedPercent}% of cap used`
        : zone === 'earning'
          ? hasMaximum
            ? `Earning rewards: ${roundedPercent}% of cap used`
            : `Earning rewards: ${roundedPercent}%`
          : zone === 'pending'
            ? `Working towards minimum: ${roundedPercent}%`
            : `Spending progress: ${roundedPercent}%`;

  return (
    <View
      style={style}
      accessible={accessible}
      accessibilityRole={accessible && hasLimits ? 'progressbar' : undefined}
      accessibilityLabel={accessible ? (accessibilityLabel ?? 'Spend progress') : undefined}
      accessibilityValue={
        accessible && hasLimits
          ? {
              min: 0,
              max: 100,
              now: roundedPercent,
              text: stateText,
            }
          : undefined
      }
    >
      <View style={[styles.track, { height }]}>
        {hasLimits && progressPercent > 0 ? (
          <View
            style={[
              styles.fill,
              {
                height,
                width: `${progressPercent}%`,
                backgroundColor: zoneFillColor(zone),
              },
              zeroProgress && styles.zeroFill,
            ]}
          />
        ) : hasLimits ? (
          <View style={[styles.zeroFill, { height: 3 }]} />
        ) : null}

        {hasMinimum && minimumPosition !== undefined && minimumPosition > 0 && minimumPosition < 100 ? (
          <View
            style={[
              styles.minimumMarker,
              { left: `${minimumPosition}%`, height: markerHeight },
              minimumMet && styles.minimumMetMarker,
            ]}
          />
        ) : null}

        {hasMaximum ? (
          <View style={[styles.capMarker, { height: markerHeight }, maximumExceeded && styles.capReachedMarker]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: semanticColors.progressTrack,
  },
  fill: {
    maxWidth: '100%',
    borderRadius: radii.pill,
  },
  zeroFill: {
    borderRadius: radii.pill,
    backgroundColor: semanticColors.action,
  },
  minimumMarker: {
    position: 'absolute',
    top: -3,
    width: 2,
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
    borderRadius: 1,
    backgroundColor: semanticColors.capped,
  },
  capReachedMarker: {
    opacity: 1,
  },
});
