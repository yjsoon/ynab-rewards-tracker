import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useStorage } from '@/contexts/StorageContext';
import { EmptyState, StatusPill } from '@/components/native';
import {
  Body,
  Button,
  Caption1,
  Footnote,
  Headline,
  Title3,
} from '@/components/ios';
import { useHaptics } from '@/hooks/useHaptics';
import { flagColor } from '@/features/cards/presentation';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import { findBestDashboardEntry } from '@ynab-counter/app-core/storage/dashboardCache';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import type {
  CardSubcategory,
  CreditCard,
} from '@ynab-counter/app-core/storage';

type EditableTier = {
  id: string;
  flagColor: CardSubcategory['flagColor'];
  name: string;
  rewardValue: string;
  milesBlockSize: string;
  minimumSpend: string;
  maximumSpend: string;
  priority: number;
  active: boolean;
  excludeFromRewards: boolean;
  createdAt: string;
};

type CardForm = {
  name: string;
  issuer: string;
  type: CreditCard['type'];
  featured: boolean;
  earningRate: string;
  earningBlockSize: string;
  minimumSpend: string;
  maximumSpend: string;
  cycleType: 'calendar' | 'billing';
  cycleDay: string;
  promotionEnabled: boolean;
  promotionStart: string;
  promotionEnd: string;
  promotionDescription: string;
  subcategoriesEnabled: boolean;
  tiers: EditableTier[];
};

type ValidationResult = {
  card?: CreditCard;
  message?: string;
};

function parameterValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function numberInput(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function createForm(card: CreditCard): CardForm {
  return {
    name: card.name,
    issuer: card.issuer === 'Unknown' ? '' : card.issuer,
    type: card.type,
    featured: card.featured !== false,
    earningRate: numberInput(card.earningRate),
    earningBlockSize: numberInput(card.earningBlockSize),
    minimumSpend: numberInput(card.minimumSpend),
    maximumSpend: numberInput(card.maximumSpend),
    cycleType: card.billingCycle?.type ?? 'calendar',
    cycleDay: String(card.billingCycle?.dayOfMonth ?? 1),
    promotionEnabled: Boolean(card.promotionalPeriod),
    promotionStart: card.promotionalPeriod?.startDate ?? '',
    promotionEnd: card.promotionalPeriod?.endDate ?? '',
    promotionDescription: card.promotionalPeriod?.description ?? '',
    subcategoriesEnabled: card.subcategoriesEnabled ?? false,
    tiers: [...(card.subcategories ?? [])]
      .sort((left, right) => left.priority - right.priority)
      .map((subcategory) => ({
        id: subcategory.id,
        flagColor: subcategory.flagColor,
        name: subcategory.name,
        rewardValue: numberInput(subcategory.rewardValue),
        milesBlockSize: numberInput(subcategory.milesBlockSize),
        minimumSpend: numberInput(subcategory.minimumSpend),
        maximumSpend: numberInput(subcategory.maximumSpend),
        priority: subcategory.priority,
        active: subcategory.active !== false,
        excludeFromRewards: subcategory.excludeFromRewards ?? false,
        createdAt: subcategory.createdAt,
      })),
  };
}

function parseOptionalNumber(
  rawValue: string,
  label: string,
  options: { strictlyPositive?: boolean; integer?: boolean } = {},
): { value?: number; error?: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) return {};

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { error: `${label} must be a number.` };
  }
  if (options.integer && !Number.isInteger(value)) {
    return { error: `${label} must be a whole number.` };
  }
  if (options.strictlyPositive ? value <= 0 : value < 0) {
    return { error: `${label} must be ${options.strictlyPositive ? 'greater than zero' : 'zero or more'}.` };
  }
  return { value };
}

function validDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function validateForm(source: CreditCard, form: CardForm): ValidationResult {
  const name = form.name.trim();
  const issuer = form.issuer.trim();
  if (!name) return { message: 'Card name is required.' };
  if (name.length > 80) return { message: 'Card name must be 80 characters or fewer.' };
  if (issuer.length > 80) return { message: 'Issuer must be 80 characters or fewer.' };

  const rate = parseOptionalNumber(form.earningRate, 'Earning rate');
  if (rate.error) return { message: rate.error };
  const block = parseOptionalNumber(form.earningBlockSize, 'Earning block', { strictlyPositive: true });
  if (block.error) return { message: block.error };
  const minimum = parseOptionalNumber(form.minimumSpend, 'Minimum spend');
  if (minimum.error) return { message: minimum.error };
  const maximum = parseOptionalNumber(form.maximumSpend, 'Spending cap');
  if (maximum.error) return { message: maximum.error };
  if ((minimum.value ?? 0) > 0 && (maximum.value ?? 0) > 0 && maximum.value! < minimum.value!) {
    return { message: 'Spending cap cannot be lower than the minimum spend.' };
  }

  const cycleDay = parseOptionalNumber(form.cycleDay, 'Billing day', { integer: true, strictlyPositive: true });
  if (form.cycleType === 'billing' && (cycleDay.error || !cycleDay.value || cycleDay.value > 31)) {
    return { message: cycleDay.error ?? 'Billing day must be from 1 to 31.' };
  }

  if (form.promotionEnabled) {
    if (!form.promotionEnd.trim()) return { message: 'Promotion end date is required.' };
    if (!validDateInput(form.promotionEnd.trim())) {
      return { message: 'Promotion end date must use YYYY-MM-DD.' };
    }
    if (form.promotionStart.trim() && !validDateInput(form.promotionStart.trim())) {
      return { message: 'Promotion start date must use YYYY-MM-DD.' };
    }
    if (form.promotionStart.trim() && form.promotionEnd.trim() <= form.promotionStart.trim()) {
      return { message: 'Promotion end date must be after its start date.' };
    }
  }

  const now = new Date().toISOString();
  const tiers: CardSubcategory[] = [];
  for (const [index, tier] of form.tiers.entries()) {
    const tierName = tier.name.trim();
    if (!tierName) return { message: `Tier ${index + 1} needs a name.` };
    const tierRate = parseOptionalNumber(tier.rewardValue, `${tierName} rate`);
    if (tierRate.error || tierRate.value === undefined) {
      return { message: tierRate.error ?? `${tierName} needs an earning rate.` };
    }
    const tierBlock = parseOptionalNumber(tier.milesBlockSize, `${tierName} block`, { strictlyPositive: true });
    if (tierBlock.error) return { message: tierBlock.error };
    const tierMinimum = parseOptionalNumber(tier.minimumSpend, `${tierName} minimum`);
    if (tierMinimum.error) return { message: tierMinimum.error };
    const tierMaximum = parseOptionalNumber(tier.maximumSpend, `${tierName} cap`);
    if (tierMaximum.error) return { message: tierMaximum.error };
    if ((tierMinimum.value ?? 0) > 0 && (tierMaximum.value ?? 0) > 0 && tierMaximum.value! < tierMinimum.value!) {
      return { message: `${tierName} cap cannot be lower than its minimum.` };
    }

    tiers.push({
      id: tier.id,
      flagColor: tier.flagColor,
      name: tierName,
      rewardValue: tierRate.value,
      milesBlockSize: tierBlock.value ?? null,
      minimumSpend: tierMinimum.value ?? null,
      maximumSpend: tierMaximum.value ?? null,
      priority: index,
      active: tier.active,
      excludeFromRewards: tier.excludeFromRewards,
      createdAt: tier.createdAt,
      updatedAt: now,
    });
  }

  const card: CreditCard = {
    ...source,
    name,
    issuer: issuer || 'Unknown',
    type: form.type,
    featured: form.featured,
    earningBlockSize: block.value ?? null,
    minimumSpend: minimum.value ?? null,
    maximumSpend: maximum.value ?? null,
    billingCycle: form.cycleType === 'billing'
      ? { type: 'billing', dayOfMonth: cycleDay.value ?? 1 }
      : { type: 'calendar' },
    promotionalPeriod: form.promotionEnabled
      ? {
          startDate: form.promotionStart.trim() || undefined,
          endDate: form.promotionEnd.trim(),
          description: form.promotionDescription.trim() || undefined,
        }
      : undefined,
    subcategoriesEnabled: form.subcategoriesEnabled,
    subcategories: tiers,
  };
  if (rate.value === undefined) {
    Reflect.deleteProperty(card, 'earningRate');
  } else {
    card.earningRate = rate.value;
  }

  return { card };
}

function Group({ title, footer, children }: {
  title: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Caption1 color="secondary" style={styles.sectionTitle}>{title.toUpperCase()}</Caption1>
      <View style={styles.group}>{children}</View>
      {footer ? <Footnote color="secondary" style={styles.footer}>{footer}</Footnote> : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'sentences',
  helper,
  showDivider = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  helper?: string;
  showDivider?: boolean;
}) {
  return (
    <View style={[styles.field, showDivider && styles.rowDivider]}>
      <Headline style={styles.fieldLabel}>{label}</Headline>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={semanticColors.tertiaryLabel}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={keyboardType !== 'decimal-pad' && keyboardType !== 'number-pad'}
        accessibilityLabel={label}
        style={styles.input}
      />
      {helper ? <Footnote color="secondary">{helper}</Footnote> : null}
    </View>
  );
}

function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
  showDivider = true,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  showDivider?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, showDivider && styles.rowDivider]}>
      <View style={styles.toggleCopy}>
        <Headline>{label}</Headline>
        {detail ? <Footnote color="secondary">{detail}</Footnote> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: semanticColors.systemGray5 as string, true: semanticColors.action as string }}
        ios_backgroundColor={semanticColors.systemGray5 as string}
        accessibilityLabel={label}
        accessibilityHint={detail}
      />
    </View>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  showDivider = true,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  showDivider?: boolean;
}) {
  return (
    <View style={[styles.choiceField, showDivider && styles.rowDivider]}>
      <Headline>{label}</Headline>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.segmentOption,
                selected && styles.segmentOptionSelected,
                pressed && styles.pressed,
              ]}
            >
              <Body color={selected ? 'inverse' : 'primary'} style={styles.segmentLabel}>
                {option.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TierEditor({
  tier,
  cardType,
  update,
}: {
  tier: EditableTier;
  cardType: CreditCard['type'];
  update: (patch: Partial<EditableTier>) => void;
}) {
  return (
    <View style={styles.tier}>
      <View style={styles.tierHeading}>
        <View style={styles.tierIdentity}>
          <View style={[styles.flagDot, { backgroundColor: flagColor(tier.flagColor) }]} />
          <View style={styles.tierCopy}>
            <Title3>{tier.name || 'Untitled tier'}</Title3>
            <Footnote color="secondary">YNAB {tier.flagColor === 'unflagged' ? 'unflagged' : `${tier.flagColor} flag`}</Footnote>
          </View>
        </View>
        <StatusPill
          label={tier.active ? (tier.excludeFromRewards ? 'Excluded' : 'Active') : 'Inactive'}
          tone={tier.active ? (tier.excludeFromRewards ? 'attention' : 'positive') : 'inactive'}
          size="small"
        />
      </View>

      <Field label="Tier name" value={tier.name} onChangeText={(name) => update({ name })} />
      <Field
        label={cardType === 'cashback' ? 'Cashback rate (%)' : 'Miles per dollar'}
        value={tier.rewardValue}
        onChangeText={(rewardValue) => update({ rewardValue })}
        keyboardType="decimal-pad"
      />
      {cardType === 'miles' ? (
        <Field
          label="Transaction block"
          value={tier.milesBlockSize}
          onChangeText={(milesBlockSize) => update({ milesBlockSize })}
          placeholder="Exact amount"
          keyboardType="decimal-pad"
        />
      ) : null}
      <Field
        label="Minimum spend"
        value={tier.minimumSpend}
        onChangeText={(minimumSpend) => update({ minimumSpend })}
        placeholder="None"
        keyboardType="decimal-pad"
      />
      <Field
        label="Spending cap"
        value={tier.maximumSpend}
        onChangeText={(maximumSpend) => update({ maximumSpend })}
        placeholder="None"
        keyboardType="decimal-pad"
      />
      <ToggleRow
        label="Active"
        value={tier.active}
        onValueChange={(active) => update({ active })}
      />
      <ToggleRow
        label="Exclude from rewards"
        detail="Transactions with this flag stay visible but earn nothing."
        value={tier.excludeFromRewards}
        onValueChange={(excludeFromRewards) => update({ excludeFromRewards })}
        showDivider={false}
      />
    </View>
  );
}

export default function EditCardScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const cardId = parameterValue(params.id);
  const router = useRouter();
  const { state, status, actions } = useStorage();
  const { notification } = useHaptics();
  const sourceCard = state.cards.find((card) => card.id === cardId);
  const [form, setForm] = useState<CardForm | undefined>(() => sourceCard ? createForm(sourceCard) : undefined);
  const initialisedCardIdRef = useRef<string | undefined>(sourceCard?.id);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const accountName = useMemo(
    () => state.accounts.find((account) => account.id === sourceCard?.ynabAccountId)?.name ?? sourceCard?.name,
    [sourceCard, state.accounts],
  );

  useEffect(() => {
    if (sourceCard && initialisedCardIdRef.current !== sourceCard.id) {
      initialisedCardIdRef.current = sourceCard.id;
      setForm(createForm(sourceCard));
    }
  }, [sourceCard]);

  const patchForm = <K extends keyof CardForm>(key: K, value: CardForm[K]) => {
    setError(undefined);
    setForm((previous) => previous ? { ...previous, [key]: value } : previous);
  };

  const updateTier = (id: string, patch: Partial<EditableTier>) => {
    setError(undefined);
    setForm((previous) => previous
      ? {
          ...previous,
          tiers: previous.tiers.map((tier) => tier.id === id ? { ...tier, ...patch } : tier),
        }
      : previous);
  };

  const save = async () => {
    if (!sourceCard || !form || saving) return;
    const validation = validateForm(sourceCard, form);
    if (!validation.card) {
      setError(validation.message ?? 'Check the highlighted values.');
      notification('error');
      return;
    }

    setSaving(true);
    setError(undefined);
    const nextCards = state.cards.map(
      (card) => card.id === sourceCard.id ? validation.card! : card,
    );
    const nextPeriodStart = getEarliestPeriodStart(nextCards);
    const cacheEntry = findBestDashboardEntry(
      state.cachedData?.dashboardTransactions,
      state.selectedBudget.id,
      state.trackedAccountIds,
    );
    const needsFullPeriodRefresh = Boolean(
      cacheEntry && nextPeriodStart < cacheEntry.sinceDate,
    );
    let cardSaved = false;
    try {
      await actions.setCards(nextCards);
      cardSaved = true;
      if (needsFullPeriodRefresh) {
        await actions.syncBudgetsAndAccounts({ sinceDate: nextPeriodStart });
      }
      notification('success');
      router.back();
    } catch {
      setError(cardSaved
        ? 'Card saved, but transactions couldn’t be refreshed. Try again to refresh this reward period.'
        : 'Couldn’t save this card. Your previous settings are still intact.');
      notification('error');
    } finally {
      setSaving(false);
    }
  };

  if (!status.isHydrated || (sourceCard && initialisedCardIdRef.current !== sourceCard.id)) {
    return (
      <View style={styles.missingScreen} accessibilityLabel="Loading card">
        <Stack.Screen options={{ title: 'Edit card' }} />
        <ActivityIndicator size="large" color={semanticColors.action} />
      </View>
    );
  }

  if (!sourceCard || !form) {
    return (
      <View style={styles.missingScreen}>
        <Stack.Screen options={{ title: 'Edit card' }} />
        <EmptyState
          title="Card not found"
          message="Return to Cards and choose a YNAB-linked card."
          action={{ label: 'View cards', onPress: () => router.replace('/(tabs)/cards') }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Edit card',
          gestureEnabled: !saving,
          headerRight: () => (
            <Button
              variant="plain"
              size="small"
              onPress={save}
              disabled={saving || !form.name.trim()}
              accessibilityLabel={saving ? 'Saving card' : 'Save card'}
              style={styles.headerButton}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ),
        }}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Headline color="destructive">Check your settings</Headline>
            <Body color="destructive">{error}</Body>
          </View>
        ) : null}

        <Group title="Card">
          <Field label="Card name" value={form.name} onChangeText={(value) => patchForm('name', value)} />
          <Field label="Issuer" value={form.issuer} onChangeText={(value) => patchForm('issuer', value)} placeholder="Unknown" />
          <Choice
            label="Reward type"
            value={form.type}
            options={[
              { value: 'cashback', label: 'Cashback' },
              { value: 'miles', label: 'Miles' },
            ]}
            onChange={(value) => patchForm('type', value)}
          />
          <ToggleRow
            label="Show on Overview"
            value={form.featured}
            onValueChange={(value) => patchForm('featured', value)}
            showDivider={false}
          />
        </Group>

        <Group title="YNAB account">
          <View style={[styles.readOnlyRow, styles.rowDivider]}>
            <View style={styles.toggleCopy}>
              <Headline>{accountName ?? sourceCard.name}</Headline>
            </View>
            <StatusPill label="Linked" tone="positive" size="small" />
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Manage YNAB account"
            accessibilityHint="Opens YNAB connection settings"
            style={({ pressed }) => [styles.navigationRow, pressed && styles.pressed]}
          >
            <Body color="action">Manage YNAB account</Body>
            <Body color="tertiary" accessibilityElementsHidden>›</Body>
          </Pressable>
        </Group>

        <Group title="Earning" footer="Leave minimum, cap, or block empty when they do not apply.">
          <Field
            label={form.type === 'cashback' ? 'Cashback rate (%)' : 'Miles per dollar'}
            value={form.earningRate}
            onChangeText={(value) => patchForm('earningRate', value)}
            keyboardType="decimal-pad"
            placeholder="Not configured"
          />
          <Field
            label="Transaction block"
            value={form.earningBlockSize}
            onChangeText={(value) => patchForm('earningBlockSize', value)}
            keyboardType="decimal-pad"
            placeholder="Exact amount"
            helper="Rewards round down within each transaction, not across the month."
          />
          <Field
            label="Minimum spend"
            value={form.minimumSpend}
            onChangeText={(value) => patchForm('minimumSpend', value)}
            keyboardType="decimal-pad"
            placeholder="None"
            helper="Rewards unlock after this amount is spent."
          />
          <Field
            label="Spending cap"
            value={form.maximumSpend}
            onChangeText={(value) => patchForm('maximumSpend', value)}
            keyboardType="decimal-pad"
            placeholder="None"
            showDivider={false}
          />
        </Group>

        <Group title="Reset cycle">
          <Choice
            label="Cycle"
            value={form.cycleType}
            options={[
              { value: 'calendar', label: 'Calendar month' },
              { value: 'billing', label: 'Billing day' },
            ]}
            onChange={(value) => patchForm('cycleType', value)}
            showDivider={form.cycleType === 'billing'}
          />
          {form.cycleType === 'billing' ? (
            <Field
              label="Billing day"
              value={form.cycleDay}
              onChangeText={(value) => patchForm('cycleDay', value)}
              keyboardType="number-pad"
              helper="Use a day from 1 to 31."
              showDivider={false}
            />
          ) : null}
        </Group>

        <Group title="Promotion" footer="Dates use YYYY-MM-DD so they remain unambiguous across devices.">
          <ToggleRow
            label="Promotional period"
            value={form.promotionEnabled}
            onValueChange={(value) => patchForm('promotionEnabled', value)}
            showDivider={form.promotionEnabled}
          />
          {form.promotionEnabled ? (
            <>
              <Field
                label="Start date"
                value={form.promotionStart}
                onChangeText={(value) => patchForm('promotionStart', value)}
                placeholder="Optional · YYYY-MM-DD"
                autoCapitalize="none"
              />
              <Field
                label="End date"
                value={form.promotionEnd}
                onChangeText={(value) => patchForm('promotionEnd', value)}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
              <Field
                label="Description"
                value={form.promotionDescription}
                onChangeText={(value) => patchForm('promotionDescription', value)}
                placeholder="e.g. 5× dining"
                showDivider={false}
              />
            </>
          ) : null}
        </Group>

        <Group title="YNAB flag tiers">
          <ToggleRow
            label="Use flag-based tiers"
            detail="Match reward rates to YNAB flags."
            value={form.subcategoriesEnabled}
            onValueChange={(value) => patchForm('subcategoriesEnabled', value)}
            showDivider={false}
          />
        </Group>

        {form.subcategoriesEnabled ? (
          form.tiers.length > 0 ? (
            <View style={styles.tiers}>
              {form.tiers.map((tier) => (
                <TierEditor
                  key={tier.id}
                  tier={tier}
                  cardType={form.type}
                  update={(patch) => updateTier(tier.id, patch)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.tierEmpty}>
              <Headline>No flag tiers yet</Headline>
              <Body color="secondary">
                Save to initialise the default unflagged tier, then return to name and tune it.
              </Body>
            </View>
          )
        ) : null}

        <View style={styles.actions}>
          <Button
            variant="filled"
            size="large"
            onPress={save}
            disabled={saving || !form.name.trim()}
            accessibilityLabel={saving ? 'Saving changes' : 'Save changes'}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            variant="plain"
            size="medium"
            onPress={() => router.back()}
            disabled={saving}
          >
            Cancel
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  missingScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nativeMetrics.screenGutter,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  content: {
    paddingHorizontal: nativeMetrics.screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: 60,
    gap: spacing.xxl,
  },
  headerButton: {
    marginHorizontal: -spacing.sm,
  },
  errorBanner: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.destructive,
    backgroundColor: semanticColors.destructiveTint,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: spacing.md,
    letterSpacing: 0.6,
  },
  group: {
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  footer: {
    paddingHorizontal: spacing.md,
  },
  field: {
    minHeight: 66,
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  fieldLabel: {
    fontSize: 15,
  },
  input: {
    minHeight: nativeMetrics.minimumTouchTarget,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.small,
    color: semanticColors.label,
    backgroundColor: semanticColors.tertiarySystemFill,
    fontSize: 17,
  },
  toggleRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  choiceField: {
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: radii.small,
    backgroundColor: semanticColors.secondarySystemFill,
  },
  segmentOption: {
    flex: 1,
    minHeight: nativeMetrics.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 7,
  },
  segmentOptionSelected: {
    backgroundColor: semanticColors.action,
  },
  segmentLabel: {
    textAlign: 'center',
    fontWeight: '600',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  readOnlyRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
  },
  navigationRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  tiers: {
    gap: spacing.xl,
  },
  tier: {
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  tierHeading: {
    minHeight: 60,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  tierIdentity: {
    flex: 1,
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  tierCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  flagDot: {
    width: 12,
    height: 12,
    marginTop: 6,
    borderRadius: 6,
  },
  tierEmpty: {
    padding: spacing.xl,
    gap: spacing.sm,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  actions: {
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
});
