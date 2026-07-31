import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Card, Headline, ListItem, SectionHeader } from '@/components/ios';
import { StatusPill } from '@/components/native';
import { useStorage } from '@/contexts/StorageContext';
import { SettingsFooter, SettingsRow } from '@/features/preferences/SettingsRow';
import { semanticColors, spacing } from '@/theme';
import { normalizeCurrencyCode } from '@ynab-counter/app-core/utils/currency';
import type { AppSettings } from '@ynab-counter/app-core/storage';

const themes: Array<{ value: NonNullable<AppSettings['theme']>; label: string; detail?: string }> = [
  { value: 'auto', label: 'Automatic', detail: 'Match this iPhone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function GeneralPreferencesScreen() {
  const { state, actions } = useStorage();
  const [currency, setCurrency] = useState(normalizeCurrencyCode(state.settings.currency));
  const [milesValue, setMilesValue] = useState(String(state.settings.milesValuation ?? 0.01));
  const [message, setMessage] = useState<string>();

  useEffect(
    () => setCurrency(normalizeCurrencyCode(state.settings.currency)),
    [state.settings.currency],
  );
  useEffect(
    () => setMilesValue(String(state.settings.milesValuation ?? 0.01)),
    [state.settings.milesValuation],
  );

  const sample = useMemo(() => {
    const numeric = Number.parseFloat(milesValue);
    if (!Number.isFinite(numeric) || numeric < 0) return undefined;
    const candidate = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(candidate)) return undefined;
    try {
      new Intl.NumberFormat(undefined, { style: 'currency', currency: candidate });
      const code = normalizeCurrencyCode(candidate);
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 2,
      }).format(numeric * 1000);
    } catch {
      return undefined;
    }
  }, [currency, milesValue]);

  const selectTheme = async (theme: NonNullable<AppSettings['theme']>) => {
    await actions.setSettings({ theme });
    setMessage('Appearance saved');
  };

  const saveCurrency = async () => {
    const candidate = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(candidate)) {
      setMessage('Enter a three-letter currency code, such as SGD.');
      return;
    }
    try {
      new Intl.NumberFormat(undefined, { style: 'currency', currency: candidate });
    } catch {
      setMessage('That currency code is not supported on this device.');
      return;
    }
    const code = normalizeCurrencyCode(candidate);
    setCurrency(code);
    await actions.setSettings({ currency: code });
    setMessage('Currency saved');
  };

  const saveMilesValue = async () => {
    const candidate = Number.parseFloat(milesValue);
    if (!Number.isFinite(candidate) || candidate < 0 || candidate > 10) {
      setMessage('Enter a value between 0 and 10.');
      return;
    }
    await actions.setSettings({ milesValuation: candidate });
    setMilesValue(String(candidate));
    setMessage('Miles value saved');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {Platform.OS === 'ios' ? (
          <View>
            <SectionHeader>APPEARANCE</SectionHeader>
            <Card>
              {themes.map((theme, index) => {
                const selected = (state.settings.theme ?? 'auto') === theme.value;
                return (
                  <SettingsRow
                    key={theme.value}
                    isFirst={index === 0}
                    title={theme.label}
                    subtitle={theme.detail}
                    symbol={theme.value === 'auto' ? 'circle.lefthalf.filled' : theme.value === 'light' ? 'sun.max.fill' : 'moon.fill'}
                    onPress={() => void selectTheme(theme.value)}
                    trailing={selected ? (
                      <SymbolView name="checkmark" size={18} weight="semibold" tintColor={semanticColors.action} />
                    ) : null}
                    accessibilityLabel={`${theme.label}${selected ? ', selected' : ''}`}
                  />
                );
              })}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader>REWARD VALUE</SectionHeader>
          <Card>
            <ListItem isFirst accessibilityLabel={`Currency ${currency}`}>
              <View style={styles.formRow}>
                <View style={styles.formCopy}>
                  <Headline>Currency</Headline>
                </View>
                <TextInput
                  value={currency}
                  onChangeText={(value) => setCurrency(value.toUpperCase())}
                  onEndEditing={() => void saveCurrency()}
                  maxLength={3}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  style={styles.field}
                  accessibilityLabel="Currency code"
                />
              </View>
            </ListItem>
            <ListItem accessibilityLabel={`One mile is worth ${milesValue}`}>
              <View style={styles.formRow}>
                <View style={styles.formCopy}>
                  <Headline>Value per mile</Headline>
                </View>
                <TextInput
                  value={milesValue}
                  onChangeText={setMilesValue}
                  onEndEditing={() => void saveMilesValue()}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={styles.field}
                  accessibilityLabel="Value per mile"
                />
              </View>
            </ListItem>
          </Card>
          <SettingsFooter>
            {sample ? `At this value, 1,000 miles are worth approximately ${sample}.` : 'Miles value is used only to compare cards in one currency.'}
          </SettingsFooter>
        </View>

        {message ? (
          <StatusPill
            label={message}
            tone={message.includes('saved') ? 'positive' : 'attention'}
            style={styles.message}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 48,
    gap: spacing.xxl,
  },
  formRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  formCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  field: {
    minWidth: 82,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    color: semanticColors.label,
    backgroundColor: semanticColors.tertiarySystemFill,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  message: {
    alignSelf: 'center',
  },
});
