import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { Body, Button, Caption1, Footnote, Headline, Title3 } from '@/components/ios';
import {
  getDashboardPeriodValue,
  setDashboardPeriodValue,
  todayDateValue,
} from '@/features/overview/period-store';
import {
  formatDateValue,
  parseDateValue,
  shiftDashboardPeriodDays,
  shiftDashboardPeriodMonths,
} from '@/lib/dashboard-period';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import type { TextColor } from '@/components/ios/Typography';

function StepperRow({
  label,
  value,
  onStep,
  canStepForward,
}: {
  label: string;
  value: string;
  onStep: (delta: number) => void;
  canStepForward: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Caption1 color="secondary" style={styles.stepperLabel}>{label}</Caption1>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onStep(-1)}
          accessibilityRole="button"
          accessibilityLabel={`Earlier ${label.toLowerCase()}`}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
        >
          <SymbolView
            name="chevron.left"
            size={15}
            tintColor={semanticColors.action}
            accessibilityElementsHidden
          />
        </Pressable>
        <Headline style={styles.stepValue} accessible={false}>{value}</Headline>
        <Pressable
          onPress={() => onStep(1)}
          disabled={!canStepForward}
          accessibilityRole="button"
          accessibilityLabel={`Later ${label.toLowerCase()}`}
          accessibilityState={{ disabled: !canStepForward }}
          style={({ pressed }) => [styles.stepButton, !canStepForward && styles.stepButtonDisabled, pressed && styles.pressed]}
        >
          <SymbolView
            name="chevron.right"
            size={15}
            tintColor={canStepForward ? semanticColors.action : semanticColors.tertiaryLabel}
            accessibilityElementsHidden
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function DashboardPeriodScreen() {
  const router = useRouter();
  const [dateValue, setDateValue] = useState(() => getDashboardPeriodValue() ?? todayDateValue());
  const todayValue = todayDateValue();
  const isToday = dateValue === todayValue;
  const dateLabel = formatDateValue(parseDateValue(dateValue) ?? new Date());
  const snapshotLabel = isToday
    ? { text: 'Live snapshot', color: 'positive' as TextColor }
    : { text: 'Historical snapshot', color: 'attention' as TextColor };
  const snapshotDetail = isToday
    ? 'Rewards show today\u2019s current progress.'
    : `Spend and rewards as they stood on ${dateLabel}.`;

  const commit = () => {
    setDashboardPeriodValue(dateValue);
    router.back();
  };

  const resetToday = () => {
    setDashboardPeriodValue(undefined);
    router.back();
  };

  const stepDays = (delta: number) => {
    setDateValue(shiftDashboardPeriodDays(dateValue, delta));
  };

  const stepMonths = (delta: number) => {
    setDateValue(shiftDashboardPeriodMonths(dateValue, delta));
  };

  const dayLabel = dateValue === todayValue
    ? 'Today'
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
      .format(parseDateValue(dateValue) ?? new Date());
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(parseDateValue(dateValue) ?? new Date());
  const canStepForward = !isToday;
  const canGoEarlier = parseDateValue(dateValue) !== null;

  return (
    <>
      <Stack.Screen options={{ title: 'Dashboard period' }} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.snapshot}>
            <View style={styles.snapshotRow}>
              <View style={[styles.snapshotDot, { backgroundColor: isToday ? semanticColors.positive : semanticColors.attention }]} />
              <Body color={snapshotLabel.color} style={styles.snapshotLabel}>{snapshotLabel.text}</Body>
            </View>
            <Title3 style={styles.tabular}>{dateLabel}</Title3>
            <Footnote color="secondary">{monthLabel}</Footnote>
            <Footnote color="secondary">{snapshotDetail}</Footnote>
          </View>

          {!isToday ? (
            <View style={styles.section}>
              <View style={styles.group}>
                <Button
                  variant="filled"
                  size="medium"
                  onPress={resetToday}
                  accessibilityHint="Returns the dashboard to live mode"
                >
                  Back to today
                </Button>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Caption1 color="secondary" style={styles.sectionTitle}>Step through time</Caption1>
            <View style={styles.group}>
              <StepperRow
                label="Day"
                value={dayLabel}
                onStep={stepDays}
                canStepForward={canStepForward}
              />
              <View style={styles.rowDivider} />
              <StepperRow
                label="Month"
                value={monthLabel}
                onStep={stepMonths}
                canStepForward={canStepForward}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Caption1 color="secondary" style={styles.sectionTitle}>Jump to a date</Caption1>
            <View style={styles.group}>
              <View style={styles.jumpRow}>
                <TextInput
                  value={dateValue}
                  onChangeText={setDateValue}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={semanticColors.tertiaryLabel}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Date in YYYY-MM-DD format"
                  style={styles.input}
                />
                {!canGoEarlier ? (
                  <Footnote color="attention" style={styles.inputError}>
                    Enter a date on or before today
                  </Footnote>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            variant="filled"
            size="large"
            onPress={commit}
            disabled={!canGoEarlier}
            accessibilityHint="Shows the dashboard as it stood on the selected date"
          >
            View this date
          </Button>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    flex: 1,
    padding: nativeMetrics.screenGutter,
    gap: spacing.xxl,
  },
  snapshot: {
    gap: spacing.xs,
    padding: spacing.xl,
    borderRadius: radii.xlarge,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  snapshotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  snapshotLabel: {
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  group: {
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stepperLabel: {
    flexShrink: 0,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.medium,
    backgroundColor: semanticColors.tertiarySystemFill,
  },
  stepButtonDisabled: {
    opacity: interaction.disabledOpacity,
  },
  stepValue: {
    minWidth: 110,
    textAlign: 'center',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.separator,
  },
  jumpRow: {
    gap: spacing.sm,
  },
  input: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.medium,
    backgroundColor: semanticColors.tertiarySystemFill,
    color: semanticColors.label,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  inputError: {
    paddingLeft: spacing.xs,
  },
  footer: {
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.md,
    paddingBottom: nativeMetrics.screenGutter,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
