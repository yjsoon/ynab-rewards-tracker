import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Body, Caption1, Footnote, Headline } from '../ios/Typography';
import { BrandMark } from '../brand';
import { useHaptics } from '../../hooks/useHaptics';
import { semanticColors, withAlpha } from '../../theme/semanticColors';
import { interaction, nativeMetrics, radii, spacing } from '../../theme/tokens';
import { MetricValue } from './MetricValue';
import { ProgressRail } from './ProgressRail';
import { StatusPill, type StatusTone } from './StatusPill';

export type CardTrackingStatus =
  | 'tracking'
  | 'minimum-met'
  | 'capped'
  | 'attention'
  | 'inactive';

export interface CardStatusDescriptor {
  label: string;
  tone: StatusTone;
}

export interface CardStatusRowProps {
  name: string;
  issuer?: string;
  periodLabel?: string;
  rewardValue: string;
  rewardLabel?: string;
  spend: number;
  formatValue: (value: number) => string;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  status?: CardTrackingStatus | CardStatusDescriptor;
  promo?: boolean;
  ruleCount?: number;
  onPress?: () => void;
  disabled?: boolean;
  showBrandMark?: boolean;
  showDivider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const statusPresentation: Record<CardTrackingStatus, CardStatusDescriptor> = {
  tracking: { label: 'Tracking', tone: 'accent' },
  'minimum-met': { label: 'Minimum met', tone: 'positive' },
  capped: { label: 'Cap reached', tone: 'capped' },
  attention: { label: 'Check card', tone: 'attention' },
  inactive: { label: 'Inactive', tone: 'inactive' },
};

function isPositiveThreshold(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function resolveStatus(
  status: CardStatusRowProps['status'],
  spend: number,
  minimumSpend: number | null | undefined,
  maximumSpend: number | null | undefined,
): CardStatusDescriptor {
  if (status && typeof status === 'object') {
    return status;
  }
  if (status) {
    return statusPresentation[status];
  }
  if (isPositiveThreshold(maximumSpend) && spend >= maximumSpend) {
    return statusPresentation.capped;
  }
  if (isPositiveThreshold(minimumSpend) && spend >= minimumSpend) {
    return statusPresentation['minimum-met'];
  }
  return statusPresentation.tracking;
}

function joinContext(issuer?: string, periodLabel?: string): string | undefined {
  const values = [issuer, periodLabel].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(' · ') : undefined;
}

/**
 * The primary Home/Cards scanning primitive: one native list row, two metrics,
 * and one meaningful progress rail. It intentionally avoids dashboard tiles.
 */
export function CardStatusRow({
  name,
  issuer,
  periodLabel,
  rewardValue,
  rewardLabel = 'Earned',
  spend,
  formatValue,
  minimumSpend,
  maximumSpend,
  status,
  promo = false,
  ruleCount = 0,
  onPress,
  disabled = false,
  showBrandMark = true,
  showDivider = true,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardStatusRowProps) {
  const { selection } = useHaptics();
  const groupsAccessibilityContent = Boolean(onPress);
  const resolvedStatus = resolveStatus(status, spend, minimumSpend, maximumSpend);
  const context = joinContext(issuer, periodLabel);
  const showsStatus = resolvedStatus.tone === 'attention' ||
    resolvedStatus.tone === 'capped' ||
    resolvedStatus.tone === 'inactive';
  const hasMinimum = isPositiveThreshold(minimumSpend);
  const hasMaximum = isPositiveThreshold(maximumSpend);

  const thresholdLabel = [
    hasMinimum ? `minimum ${formatValue(minimumSpend)}` : undefined,
    hasMaximum ? `cap ${formatValue(maximumSpend)}` : undefined,
  ].filter((value): value is string => Boolean(value)).join(', ');

  const badges = [
    promo ? 'promotional period active' : undefined,
    ruleCount > 0 ? `${ruleCount} flag ${ruleCount === 1 ? 'rule' : 'rules'}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const resolvedAccessibilityLabel = accessibilityLabel ?? [
    name,
    issuer,
    periodLabel,
    `${rewardLabel} ${rewardValue}`,
    `spent ${formatValue(spend)}`,
    resolvedStatus.label,
    thresholdLabel || undefined,
    ...badges,
  ].filter(Boolean).join(', ');

  const content = (
    <View style={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.identity}>
          {showBrandMark ? (
            <BrandMark width={28} height={28} style={styles.brandMark} />
          ) : null}
          <View style={styles.titleCopy}>
            <Headline accessible={!groupsAccessibilityContent}>{name}</Headline>
            {context ? (
              <Footnote color="secondary" accessible={!groupsAccessibilityContent} style={styles.context}>
                {context}
              </Footnote>
            ) : null}
          </View>
        </View>

        <View style={styles.trailing}>
          {promo ? (
            <View
              style={styles.promoPill}
              accessible={!groupsAccessibilityContent}
              accessibilityLabel="Promotional period active"
            >
              <SymbolView
                name="sparkles"
                size={10}
                tintColor={semanticColors.systemPurple}
                accessibilityElementsHidden
                fallback={<Text style={styles.promoFallback}>*</Text>}
              />
              <Caption1 style={styles.promoText} accessible={false}>Promo</Caption1>
            </View>
          ) : null}
          {ruleCount > 0 ? (
            <View
              style={styles.rulePill}
              accessible={!groupsAccessibilityContent}
              accessibilityLabel={`${ruleCount} flag ${ruleCount === 1 ? 'rule' : 'rules'}`}
            >
              <SymbolView
                name="tag"
                size={10}
                tintColor={semanticColors.secondaryLabel}
                accessibilityElementsHidden
                fallback={<Text style={styles.ruleFallback}>#</Text>}
              />
              <Caption1 color="secondary" style={styles.ruleText} accessible={false}>
                {ruleCount} {ruleCount === 1 ? 'rule' : 'rules'}
              </Caption1>
            </View>
          ) : null}
          {showsStatus ? (
            <StatusPill
              label={resolvedStatus.label}
              tone={resolvedStatus.tone}
              size="small"
              accessible={!groupsAccessibilityContent}
            />
          ) : null}
          {onPress ? (
            <Body color="tertiary" accessible={false} style={styles.disclosure}>
              {'\u203A'}
            </Body>
          ) : null}
        </View>
      </View>

      <View style={[styles.metrics, showBrandMark && styles.metricsWithMark]}>
        <MetricValue
          label={rewardLabel}
          value={rewardValue}
          size="medium"
          accessible={!groupsAccessibilityContent}
          style={styles.rewardMetric}
        />
        <MetricValue
          label="Spent"
          value={formatValue(spend)}
          size="compact"
          align="right"
          accessible={!groupsAccessibilityContent}
          style={styles.spendMetric}
        />
      </View>

      {hasMinimum || hasMaximum ? (
        <ProgressRail
          value={spend}
          minimum={minimumSpend}
          maximum={maximumSpend}
          formatValue={formatValue}
          label={`${name} spend progress`}
          accessible={!groupsAccessibilityContent}
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.wrapper, disabled && styles.disabled, style]}>
      {onPress ? (
        <Pressable
          onPress={() => {
            selection();
            onPress();
          }}
          disabled={disabled}
          accessible
          accessibilityRole="button"
          accessibilityLabel={resolvedAccessibilityLabel}
          accessibilityHint={accessibilityHint ?? 'Opens card details'}
          accessibilityState={{ disabled }}
          testID={testID}
          style={({ pressed }) => [
            styles.pressable,
            pressed && styles.pressed,
          ]}
        >
          {content}
        </Pressable>
      ) : (
        <View testID={testID} style={styles.pressable}>
          {content}
        </View>
      )}
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    minHeight: nativeMetrics.minimumTouchTarget,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
  pressable: {
    minHeight: nativeMetrics.minimumTouchTarget,
    borderRadius: radii.large,
  },
  pressed: {
    backgroundColor: semanticColors.tertiarySystemFill,
    opacity: interaction.subtlePressedOpacity,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  headingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    columnGap: spacing.md,
    rowGap: spacing.sm,
  },
  identity: {
    flex: 1,
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  brandMark: {
    marginTop: spacing.xxs,
    flexShrink: 0,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  context: {
    flexShrink: 1,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
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
    fontSize: 11,
  },
  promoFallback: {
    color: semanticColors.systemPurple,
    fontSize: 10,
    fontWeight: '700',
  },
  rulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: semanticColors.tertiarySystemFill,
  },
  ruleText: {
    fontWeight: '600',
    fontSize: 11,
  },
  ruleFallback: {
    color: semanticColors.secondaryLabel,
    fontSize: 10,
    fontWeight: '700',
  },
  disclosure: {
    fontSize: 25,
    marginTop: -2,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    columnGap: spacing.xxl,
    rowGap: spacing.md,
  },
  metricsWithMark: {
    paddingLeft: 40,
  },
  rewardMetric: {
    flexGrow: 1,
  },
  spendMetric: {
    flexShrink: 1,
  },
  divider: {
    position: 'absolute',
    left: nativeMetrics.hairlineInset,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.separator,
  },
});
