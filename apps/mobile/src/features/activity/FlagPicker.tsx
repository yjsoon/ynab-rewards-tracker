import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Body, Footnote } from '@/components/ios';
import { flagColorValue } from '@/features/activity/presentation';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, spacing } from '@/theme/tokens';
import type { YnabTransactionFlagColor } from '@/lib/ynab-client';

const FLAG_OPTIONS: ReadonlyArray<{
  value: YnabTransactionFlagColor;
  label: string;
}> = [
  { value: null, label: 'No flag' },
  { value: 'red', label: 'Red flag' },
  { value: 'orange', label: 'Orange flag' },
  { value: 'yellow', label: 'Yellow flag' },
  { value: 'green', label: 'Green flag' },
  { value: 'blue', label: 'Blue flag' },
  { value: 'purple', label: 'Purple flag' },
];

export interface FlagPickerProps {
  value: YnabTransactionFlagColor;
  onChange: (value: YnabTransactionFlagColor) => void;
  disabled?: boolean;
  isSaving?: boolean;
  error?: string;
}

function selectedLabel(value: YnabTransactionFlagColor): string {
  return FLAG_OPTIONS.find((option) => option.value === value)?.label ?? 'No flag';
}

export function FlagPicker({
  value,
  onChange,
  disabled = false,
  isSaving = false,
  error,
}: FlagPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Body>{selectedLabel(value)}</Body>
        {isSaving ? (
          <View
            style={styles.saving}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Saving flag colour to YNAB"
          >
            <ActivityIndicator size="small" color={semanticColors.action} />
            <Footnote color="secondary">Saving…</Footnote>
          </View>
        ) : null}
      </View>

      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Transaction flag colour"
      >
        {FLAG_OPTIONS.map((option) => {
          const selected = option.value === value;
          const isNone = option.value === null;

          return (
            <Pressable
              key={option.value ?? 'none'}
              onPress={() => onChange(option.value)}
              disabled={disabled || isSaving}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint="Updates this transaction in YNAB"
              accessibilityState={{
                checked: selected,
                disabled: disabled || isSaving,
              }}
              hitSlop={2}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
                (disabled || isSaving) && styles.optionDisabled,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  isNone
                    ? styles.noFlagSwatch
                    : { backgroundColor: flagColorValue(option.value) },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {isNone ? <View style={styles.noFlagSlash} /> : null}
                {selected && !isNone ? (
                  <Body
                    style={[
                      styles.checkmark,
                      option.value === 'yellow' && styles.darkCheckmark,
                    ]}
                  >
                    ✓
                  </Body>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Footnote color="secondary">
        Flag colours can drive your reward-category matching.
      </Footnote>
      {error ? (
        <Footnote
          color="destructive"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {error}
        </Footnote>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Wrap the seven full-size controls on compact screens.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  statusRow: {
    minHeight: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  saving: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  option: {
    width: nativeMetrics.minimumTouchTarget,
    height: nativeMetrics.minimumTouchTarget,
    borderRadius: nativeMetrics.minimumTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: semanticColors.action,
    backgroundColor: semanticColors.actionTint,
  },
  optionPressed: {
    opacity: interaction.pressedOpacity,
  },
  optionDisabled: {
    opacity: interaction.disabledOpacity,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noFlagSwatch: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.systemGray2,
    backgroundColor: semanticColors.tertiarySystemFill,
    overflow: 'hidden',
  },
  noFlagSlash: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: semanticColors.systemGray,
    transform: [{ rotate: '-45deg' }],
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  darkCheckmark: {
    color: '#2C2C2E',
  },
});
