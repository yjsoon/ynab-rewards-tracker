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
import { createCardFormatting, flagColor } from '@/features/cards/presentation';
import { planCardEditRefresh } from '@/features/cards/card-edit-refresh';
import { createLocalFlagUpdatePublication } from '@/features/activity/flag-update-publication';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';
import {
  findExactDashboardEntry,
} from '@ynab-counter/app-core/storage/dashboardCache';
import { getEarliestPeriodStart } from '@ynab-counter/app-core/rewards-engine/utils/periods';
import {
  createSubcategoryId,
  createSpendingTierId,
  type CardSpendingTier,
  type CardSubcategory,
  type CreditCard,
  type SpendingTierSubcategory,
} from '@ynab-counter/app-core/storage';
import {
  UNFLAGGED_FLAG,
  YNAB_FLAG_COLORS,
  type YnabFlagColor,
} from '@ynab-counter/app-core/ynab/constants';

const FLAG_OPTIONS: ReadonlyArray<{ value: YnabFlagColor; label: string }> = [
  UNFLAGGED_FLAG,
  ...YNAB_FLAG_COLORS,
];

function tierNameForFlag(flag: YnabFlagColor): string {
  if (flag === UNFLAGGED_FLAG.value) return 'Everything else';
  const label = FLAG_OPTIONS.find((option) => option.value === flag)?.label ?? flag;
  return `${label} flag`;
}

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

type EditableSpendingTierSubcategory = {
  subcategoryId: string;
  rewardValue: string;
  maximumSpend: string;
};

type EditableSpendingTier = {
  id: string;
  spendThreshold: string;
  earningRate: string;
  maximumSpend: string;
  subcategories: EditableSpendingTierSubcategory[];
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
  spendingTiers: EditableSpendingTier[];
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

function formatEditableSpend(value: string, formatSpend: (amount: number) => string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatSpend(amount) : value;
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
    spendingTiers: [...(card.spendingTiers ?? [])]
      .sort((left, right) => left.spendThreshold - right.spendThreshold)
      .map((tier) => ({
        id: tier.id,
        spendThreshold: numberInput(tier.spendThreshold),
        earningRate: numberInput(tier.earningRate),
        maximumSpend: numberInput(tier.maximumSpend),
        subcategories: (tier.subcategories ?? []).map((subcategory) => ({
          subcategoryId: subcategory.subcategoryId,
          rewardValue: numberInput(subcategory.rewardValue),
          maximumSpend: numberInput(subcategory.maximumSpend),
        })),
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

function rewardConfigurationSignature(card: CreditCard): string {
  return JSON.stringify({
    type: card.type,
    earningRate: card.earningRate ?? null,
    earningBlockSize: card.earningBlockSize ?? null,
    minimumSpend: card.minimumSpend ?? null,
    maximumSpend: card.maximumSpend ?? null,
    spendingTiers: (card.spendingTiers ?? []).map((tier) => ({
      id: tier.id,
      spendThreshold: tier.spendThreshold,
      earningRate: tier.earningRate ?? null,
      maximumSpend: tier.maximumSpend ?? null,
      subcategories: (tier.subcategories ?? []).map((subcategory) => ({
        subcategoryId: subcategory.subcategoryId,
        rewardValue: subcategory.rewardValue,
        maximumSpend: subcategory.maximumSpend ?? null,
      })),
    })),
    billingCycle: card.billingCycle?.type === 'billing'
      ? { type: 'billing', dayOfMonth: card.billingCycle.dayOfMonth ?? 1 }
      : { type: 'calendar' },
    promotionalPeriod: card.promotionalPeriod
      ? {
          startDate: card.promotionalPeriod.startDate ?? null,
          endDate: card.promotionalPeriod.endDate,
        }
      : null,
    subcategoriesEnabled: card.subcategoriesEnabled ?? false,
    subcategories: (card.subcategories ?? []).map((tier) => ({
      id: tier.id,
      flagColor: tier.flagColor,
      rewardValue: tier.rewardValue,
      milesBlockSize: tier.milesBlockSize ?? null,
      minimumSpend: tier.minimumSpend ?? null,
      maximumSpend: tier.maximumSpend ?? null,
      priority: tier.priority,
      active: tier.active,
      excludeFromRewards: tier.excludeFromRewards ?? false,
    })),
  });
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
  const tierFlags = new Set<YnabFlagColor>();
  for (const [index, tier] of form.tiers.entries()) {
    if (tierFlags.has(tier.flagColor)) {
      return { message: `${tierNameForFlag(tier.flagColor)} can only be used once.` };
    }
    tierFlags.add(tier.flagColor);
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

  const spendingTiers: CardSpendingTier[] = [];
  const spendingThresholds = new Set<number>([minimum.value ?? 0]);
  for (const [index, tier] of form.spendingTiers.entries()) {
    const threshold = parseOptionalNumber(
      tier.spendThreshold,
      `Spend tier ${index + 1} threshold`,
    );
    if (threshold.error || threshold.value === undefined) {
      return { message: threshold.error ?? `Spend tier ${index + 1} needs a threshold.` };
    }
    if (spendingThresholds.has(threshold.value)) {
      return { message: `Only one reward tier can start at the ${threshold.value} threshold.` };
    }
    spendingThresholds.add(threshold.value);

    const tierRate = parseOptionalNumber(tier.earningRate, `Spend tier ${index + 1} default rate`);
    if (tierRate.error) return { message: tierRate.error };
    const tierMaximum = parseOptionalNumber(tier.maximumSpend, `Spend tier ${index + 1} overall cap`);
    if (tierMaximum.error) return { message: tierMaximum.error };

    const subcategories: SpendingTierSubcategory[] = [];
    for (const override of tier.subcategories) {
      const sourceTier = form.tiers.find(({ id }) => id === override.subcategoryId);
      if (!sourceTier) continue;
      const overrideRate = parseOptionalNumber(
        override.rewardValue,
        `${sourceTier.name || 'Flag category'} spend-tier rate`,
      );
      if (overrideRate.error || overrideRate.value === undefined) {
        return {
          message: overrideRate.error ?? `${sourceTier.name || 'Flag category'} needs a spend-tier rate.`,
        };
      }
      const overrideMaximum = parseOptionalNumber(
        override.maximumSpend,
        `${sourceTier.name || 'Flag category'} spend-tier cap`,
      );
      if (overrideMaximum.error) return { message: overrideMaximum.error };
      subcategories.push({
        subcategoryId: override.subcategoryId,
        rewardValue: overrideRate.value,
        maximumSpend: overrideMaximum.value ?? null,
      });
    }

    spendingTiers.push({
      id: tier.id,
      spendThreshold: threshold.value,
      earningRate: tierRate.value ?? null,
      maximumSpend: tierMaximum.value ?? null,
      subcategories,
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
          startDate: form.promotionStart.trim() || null,
          endDate: form.promotionEnd.trim(),
          description: form.promotionDescription.trim() || undefined,
        }
      : undefined,
    subcategoriesEnabled: form.subcategoriesEnabled,
    subcategories: tiers,
    spendingTiers: spendingTiers.sort(
      (left, right) => left.spendThreshold - right.spendThreshold,
    ),
  };
  if (rate.value === undefined) {
    card.earningRate = null;
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

function TierFlagPicker({
  value,
  usedFlagColors,
  onChange,
}: {
  value: YnabFlagColor;
  usedFlagColors: ReadonlySet<YnabFlagColor>;
  onChange: (value: YnabFlagColor) => void;
}) {
  return (
    <View style={styles.flagField}>
      <Headline>YNAB flag</Headline>
      <View
        style={styles.flagOptions}
        accessibilityRole="radiogroup"
        accessibilityLabel="YNAB flag for this tier"
      >
        {FLAG_OPTIONS.map((option) => {
          const selected = option.value === value;
          const unavailable = !selected && usedFlagColors.has(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={unavailable}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label} flag`}
              accessibilityHint={unavailable
                ? 'Already used by another tier'
                : 'Assigns this YNAB flag to the tier'}
              accessibilityState={{ checked: selected, disabled: unavailable }}
              style={({ pressed }) => [
                styles.flagOption,
                selected && styles.flagOptionSelected,
                pressed && styles.pressed,
                unavailable && styles.flagOptionUnavailable,
              ]}
            >
              <View
                style={[
                  styles.flagSwatch,
                  { backgroundColor: flagColor(option.value) },
                ]}
                accessibilityElementsHidden
              >
                {option.value === UNFLAGGED_FLAG.value ? (
                  <View style={styles.unflaggedSlash} />
                ) : null}
              </View>
              <Caption1
                color={unavailable ? 'tertiary' : 'secondary'}
                style={[styles.flagOptionLabel, selected && styles.flagOptionLabelSelected]}
              >
                {option.value === UNFLAGGED_FLAG.value ? 'None' : option.label}
              </Caption1>
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
  usedFlagColors,
  onFlagChange,
  update,
}: {
  tier: EditableTier;
  cardType: CreditCard['type'];
  usedFlagColors: ReadonlySet<YnabFlagColor>;
  onFlagChange: (value: YnabFlagColor) => void;
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
        {!tier.active || tier.excludeFromRewards ? (
          <StatusPill
            label={tier.active ? 'Excluded' : 'Inactive'}
            tone={tier.active ? 'attention' : 'inactive'}
            size="small"
          />
        ) : null}
      </View>

      <TierFlagPicker
        value={tier.flagColor}
        usedFlagColors={usedFlagColors}
        onChange={onFlagChange}
      />
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

function getEditableSpendingTierSubcategory(
  tier: EditableSpendingTier,
  flagTier: EditableTier,
): EditableSpendingTierSubcategory {
  return tier.subcategories.find(({ subcategoryId }) => subcategoryId === flagTier.id) ?? {
    subcategoryId: flagTier.id,
    rewardValue: flagTier.rewardValue,
    maximumSpend: flagTier.maximumSpend,
  };
}

function SpendingTierEditor({
  tier,
  cardType,
  formatSpend,
  flagTiers,
  update,
  updateSubcategory,
  remove,
}: {
  tier: EditableSpendingTier;
  cardType: CreditCard['type'];
  formatSpend: (value: number) => string;
  flagTiers: EditableTier[];
  update: (patch: Partial<EditableSpendingTier>) => void;
  updateSubcategory: (
    subcategoryId: string,
    patch: Partial<EditableSpendingTierSubcategory>,
  ) => void;
  remove: () => void;
}) {
  const earningFlagTiers = flagTiers.filter(
    (flagTier) => flagTier.active && !flagTier.excludeFromRewards,
  );

  return (
    <View style={styles.spendingTier}>
      <View style={styles.spendingTierHeading}>
        <View style={styles.tierCopy}>
          <Title3>
            {tier.spendThreshold.trim()
              ? `At ${formatEditableSpend(tier.spendThreshold, formatSpend)} total spend`
              : 'New spend tier'}
          </Title3>
          <Footnote color="secondary">Applies to the entire reward period</Footnote>
        </View>
        <Button
          variant="plain"
          size="small"
          onPress={remove}
          textStyle={styles.removeTierText}
          accessibilityLabel={tier.spendThreshold
            ? `Remove spend tier at ${formatEditableSpend(tier.spendThreshold, formatSpend)}`
            : 'Remove spend tier with no threshold'}
        >
          Remove
        </Button>
      </View>
      <Field
        label="Total spend threshold"
        value={tier.spendThreshold}
        onChangeText={(spendThreshold) => update({ spendThreshold })}
        keyboardType="decimal-pad"
        placeholder="Required"
      />
      <Field
        label={cardType === 'cashback' ? 'Default cashback rate (%)' : 'Default miles per dollar'}
        value={tier.earningRate}
        onChangeText={(earningRate) => update({ earningRate })}
        keyboardType="decimal-pad"
        placeholder="No default rate"
      />
      <Field
        label="Overall eligible-spend cap"
        value={tier.maximumSpend}
        onChangeText={(maximumSpend) => update({ maximumSpend })}
        keyboardType="decimal-pad"
        placeholder="No cap"
        showDivider={earningFlagTiers.length > 0}
      />

      {earningFlagTiers.length > 0 ? (
        <View style={styles.spendingTierCategories}>
          <View style={styles.spendingTierCategoryIntro}>
            <Headline>Flag-category rewards</Headline>
            <Footnote color="secondary">Set each category’s rate and cap at this spend level.</Footnote>
          </View>
          {earningFlagTiers.map((flagTier, index) => {
            const override = getEditableSpendingTierSubcategory(tier, flagTier);
            return (
              <View
                key={flagTier.id}
                style={[
                  styles.spendingTierCategory,
                  index < earningFlagTiers.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={styles.spendingTierCategoryHeading}>
                  <View style={[styles.flagDot, { backgroundColor: flagColor(flagTier.flagColor) }]} />
                  <View style={styles.tierCopy}>
                    <Headline>{flagTier.name || tierNameForFlag(flagTier.flagColor)}</Headline>
                    <Footnote color="secondary">
                      {flagTier.flagColor === UNFLAGGED_FLAG.value ? 'No YNAB flag' : `${flagTier.flagColor} flag`}
                    </Footnote>
                  </View>
                </View>
                <Field
                  label={cardType === 'cashback' ? 'Rate (%)' : 'Miles per dollar'}
                  value={override.rewardValue}
                  onChangeText={(rewardValue) => updateSubcategory(flagTier.id, { rewardValue })}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Eligible-spend cap"
                  value={override.maximumSpend}
                  onChangeText={(maximumSpend) => updateSubcategory(flagTier.id, { maximumSpend })}
                  keyboardType="decimal-pad"
                  placeholder="No cap"
                  showDivider={false}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function EditCardScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const cardId = parameterValue(params.id);
  const router = useRouter();
  const { state, status, actions } = useStorage();
  const formatting = useMemo(() => createCardFormatting(state.settings), [state.settings]);
  const { notification, selection } = useHaptics();
  const sourceCard = state.cards.find((card) => card.id === cardId);
  const [form, setForm] = useState<CardForm | undefined>(() => sourceCard ? createForm(sourceCard) : undefined);
  const initialisedCardIdRef = useRef<string | undefined>(sourceCard?.id);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const accountName = useMemo(
    () => state.accounts.find((account) => account.id === sourceCard?.ynabAccountId)?.name ?? sourceCard?.name,
    [sourceCard, state.accounts],
  );
  const usedFlagColors = useMemo(
    () => new Set<YnabFlagColor>(form?.tiers.map((tier) => tier.flagColor) ?? []),
    [form?.tiers],
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

  const addTier = () => {
    if (!form) return;
    const availableFlag = FLAG_OPTIONS.find((option) => !usedFlagColors.has(option.value));
    if (!availableFlag) {
      setError('Every YNAB flag already has a tier.');
      notification('warning');
      return;
    }
    const now = new Date().toISOString();
    setError(undefined);
    setForm((previous) => previous
      ? {
          ...previous,
          tiers: [
            ...previous.tiers,
            {
              id: createSubcategoryId(),
              flagColor: availableFlag.value,
              name: tierNameForFlag(availableFlag.value),
              rewardValue: previous.earningRate.trim() || '0',
              milesBlockSize: '',
              minimumSpend: '',
              maximumSpend: '',
              priority: previous.tiers.length,
              active: true,
              excludeFromRewards: false,
              createdAt: now,
            },
          ],
        }
      : previous);
    selection();
  };

  const addSpendingTier = () => {
    setError(undefined);
    setForm((previous) => {
      if (!previous) return previous;
      const thresholds = [
        Number(previous.minimumSpend) || 0,
        ...previous.spendingTiers.map(({ spendThreshold }) => Number(spendThreshold) || 0),
      ];
      const highestThreshold = Math.max(...thresholds);
      const spendThreshold = highestThreshold > 0 ? highestThreshold * 2 : 500;
      return {
        ...previous,
        spendingTiers: [
          ...previous.spendingTiers,
          {
            id: createSpendingTierId(),
            spendThreshold: String(spendThreshold),
            earningRate: previous.earningRate,
            maximumSpend: previous.maximumSpend,
            subcategories: previous.tiers
              .filter((tier) => tier.active && !tier.excludeFromRewards)
              .map((tier) => ({
                subcategoryId: tier.id,
                rewardValue: tier.rewardValue,
                maximumSpend: tier.maximumSpend,
              })),
          },
        ],
      };
    });
    selection();
  };

  const updateSpendingTier = (id: string, patch: Partial<EditableSpendingTier>) => {
    setError(undefined);
    setForm((previous) => previous
      ? {
          ...previous,
          spendingTiers: previous.spendingTiers.map(
            (tier) => tier.id === id ? { ...tier, ...patch } : tier,
          ),
        }
      : previous);
  };

  const updateSpendingTierSubcategory = (
    tierId: string,
    subcategoryId: string,
    patch: Partial<EditableSpendingTierSubcategory>,
  ) => {
    setError(undefined);
    setForm((previous) => previous
      ? {
          ...previous,
          spendingTiers: previous.spendingTiers.map((tier) => {
            if (tier.id !== tierId) return tier;
            const existing = tier.subcategories.find(
              (subcategory) => subcategory.subcategoryId === subcategoryId,
            );
            const source = previous.tiers.find(({ id }) => id === subcategoryId);
            const nextSubcategory: EditableSpendingTierSubcategory = {
              subcategoryId,
              rewardValue: existing?.rewardValue ?? source?.rewardValue ?? '',
              maximumSpend: existing?.maximumSpend ?? source?.maximumSpend ?? '',
              ...patch,
            };
            return {
              ...tier,
              subcategories: existing
                ? tier.subcategories.map((subcategory) => (
                    subcategory.subcategoryId === subcategoryId ? nextSubcategory : subcategory
                  ))
                : [...tier.subcategories, nextSubcategory],
            };
          }),
        }
      : previous);
  };

  const removeSpendingTier = (id: string) => {
    setError(undefined);
    setForm((previous) => previous
      ? {
          ...previous,
          spendingTiers: previous.spendingTiers.filter((tier) => tier.id !== id),
        }
      : previous);
    selection();
  };

  const changeTierFlag = (id: string, nextFlag: YnabFlagColor) => {
    if (usedFlagColors.has(nextFlag)) return;
    setError(undefined);
    setForm((previous) => previous
      ? {
          ...previous,
          tiers: previous.tiers.map((tier) => {
            if (tier.id !== id) return tier;
            const previousDefaultName = tierNameForFlag(tier.flagColor);
            return {
              ...tier,
              flagColor: nextFlag,
              name: tier.name === previousDefaultName ? tierNameForFlag(nextFlag) : tier.name,
            };
          }),
        }
      : previous);
    selection();
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
    const cacheEntry = findExactDashboardEntry(
      state.cachedData?.dashboardTransactions,
      state.selectedBudget.id,
      state.trackedAccountIds,
    );
    const rewardConfigurationChanged = rewardConfigurationSignature(sourceCard)
      !== rewardConfigurationSignature(validation.card);
    const refreshPlan = planCardEditRefresh({
      cacheEntry,
      nextPeriodStart,
      rewardConfigurationChanged,
    });
    const { needsFullPeriodRefresh } = refreshPlan;
    const canRefresh = Boolean(
      state.pat && state.selectedBudget.id && state.trackedAccountIds.length > 0,
    );
    let cardSaved = false;
    try {
      if (rewardConfigurationChanged) {
        actions.invalidateSyncRequests();
      }
      await actions.setCards(nextCards);
      cardSaved = true;
      if (
        refreshPlan.publishCalculationsLocally
        && cacheEntry
      ) {
        const publication = createLocalFlagUpdatePublication({
          cacheEntry,
          cards: nextCards,
          settings: state.settings,
          calculations: state.calculations,
        });
        await actions.setCalculations(publication.calculations);
      }
      if (needsFullPeriodRefresh) {
        if (cacheEntry && cacheEntry.requiresFullRefresh !== true) {
          await actions.setDashboardCachedData({
            budgetId: cacheEntry.budgetId,
            sinceDate: cacheEntry.sinceDate,
            fetchedAt: cacheEntry.fetchedAt,
            trackedAccountIds: cacheEntry.trackedAccountIds,
            isComplete: cacheEntry.isComplete,
            requiresFullRefresh: true,
            transactions: cacheEntry.transactions,
            accounts: cacheEntry.accounts,
          });
        }
        if (!canRefresh) {
          throw new Error('YNAB connection required for reward refresh');
        }
        await actions.syncBudgetsAndAccounts({ sinceDate: nextPeriodStart });
      }
      notification('success');
      router.back();
    } catch {
      setError(cardSaved
        ? canRefresh
          ? 'Card saved, but transactions couldn’t be refreshed. Tap Save to try again.'
          : 'Card saved. Reconnect YNAB, then tap Save to refresh this reward period.'
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
          <View style={styles.tierComposer}>
            {form.tiers.length > 0 ? (
              <View style={styles.tiers}>
                {form.tiers.map((tier) => (
                  <TierEditor
                    key={tier.id}
                    tier={tier}
                    cardType={form.type}
                    usedFlagColors={usedFlagColors}
                    onFlagChange={(flag) => changeTierFlag(tier.id, flag)}
                    update={(patch) => updateTier(tier.id, patch)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.tierEmpty}>
                <Headline>No flag tiers yet</Headline>
                <Body color="secondary">Add a tier for each YNAB flag you use.</Body>
              </View>
            )}
            <Button
              variant="tinted"
              size="large"
              onPress={addTier}
              disabled={usedFlagColors.size >= FLAG_OPTIONS.length}
              accessibilityHint="Adds a tier using the next available YNAB flag"
            >
              {usedFlagColors.size >= FLAG_OPTIONS.length
                ? 'All flag colours added'
                : 'Add flag tier'}
            </Button>
          </View>
        ) : null}

        <Group
          title="Spend-based reward tiers"
          footer="The highest total-spend threshold reached sets rates and eligible-spend caps for the entire reward period."
        >
          <View style={[styles.spendingTierBase, styles.rowDivider]}>
            <Headline>Base level</Headline>
            <Footnote color="secondary">
              {form.minimumSpend.trim()
                ? `Starts at ${formatEditableSpend(form.minimumSpend, formatting.currencyCompact)} total spend`
                : 'No spend threshold'}
              {' · '}
              {form.earningRate.trim()
                ? form.type === 'cashback'
                  ? `${form.earningRate}% default cashback`
                  : `${form.earningRate} default miles per dollar`
                : 'No default rate'}
              {' · '}
              {form.maximumSpend.trim()
                ? `${formatEditableSpend(form.maximumSpend, formatting.currencyCompact)} overall cap`
                : 'No overall cap'}
            </Footnote>
            <Footnote color="tertiary">
              Your existing earning and flag-category settings stay as this level.
            </Footnote>
          </View>
          <Button
            variant="plain"
            size="medium"
            onPress={addSpendingTier}
            style={styles.addSpendingTierButton}
            accessibilityHint="Adds another reward level based on total card spend"
          >
            Add spend tier
          </Button>
        </Group>

        {form.spendingTiers.length > 0 ? (
          <View style={styles.spendingTierComposer}>
            {[...form.spendingTiers]
              .sort((left, right) => (
                (Number(left.spendThreshold) || 0) - (Number(right.spendThreshold) || 0)
              ))
              .map((tier) => (
                <SpendingTierEditor
                  key={tier.id}
                  tier={tier}
                  cardType={form.type}
                  formatSpend={formatting.currencyCompact}
                  flagTiers={form.subcategoriesEnabled ? form.tiers : []}
                  update={(patch) => updateSpendingTier(tier.id, patch)}
                  updateSubcategory={(subcategoryId, patch) => (
                    updateSpendingTierSubcategory(tier.id, subcategoryId, patch)
                  )}
                  remove={() => removeSpendingTier(tier.id)}
                />
              ))}
          </View>
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
  tierComposer: {
    gap: spacing.lg,
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
  flagField: {
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  flagOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  flagOption: {
    width: '25%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.medium,
  },
  flagOptionSelected: {
    backgroundColor: semanticColors.actionTint,
  },
  flagOptionUnavailable: {
    opacity: interaction.disabledOpacity,
  },
  flagSwatch: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  unflaggedSlash: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: semanticColors.systemBackground,
    transform: [{ rotate: '-45deg' }],
  },
  flagOptionLabel: {
    textAlign: 'center',
  },
  flagOptionLabelSelected: {
    color: semanticColors.action,
    fontWeight: '600',
  },
  tierEmpty: {
    padding: spacing.xl,
    gap: spacing.sm,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  spendingTierBase: {
    minHeight: 76,
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  addSpendingTierButton: {
    alignSelf: 'stretch',
    borderRadius: 0,
  },
  spendingTierComposer: {
    gap: spacing.xl,
  },
  spendingTier: {
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  spendingTierHeading: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
  },
  removeTierText: {
    color: semanticColors.destructive,
  },
  spendingTierCategories: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.separator,
    backgroundColor: semanticColors.systemGroupedBackground,
  },
  spendingTierCategoryIntro: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  spendingTierCategory: {
    marginLeft: spacing.md,
    borderRadius: radii.medium,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  spendingTierCategoryHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  actions: {
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
});
