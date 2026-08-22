import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  applyCategoryProposal,
  CATEGORY_IMPORT_PROVIDERS,
  defaultModelFor,
  getCategoryImportProvider,
  mergeCategoryImportCredentials,
  type CardCategoryPatch,
} from '@ynab-counter/app-core/category-import';
import type {
  CardSubcategory,
  CategoryImportProvider,
  CreditCard,
  StatementFormatterSettings,
} from '@ynab-counter/app-core/storage/types';

import { Body, Button, Caption1, Footnote, Headline } from '@/components/ios';
import { useHaptics } from '@/hooks/useHaptics';
import { semanticColors } from '@/theme';
import { interaction, nativeMetrics, radii, spacing } from '@/theme/tokens';

import { requestMobileCategoryImport } from './category-import-form';

interface CategoryImportComposerProps {
  card: CreditCard;
  cardType: CreditCard['type'];
  earningRate?: number | null;
  existingSubcategories: Array<Pick<CardSubcategory, 'name' | 'flagColor'>>;
  formatterSettings?: StatementFormatterSettings;
  onPersistSettings: (settings: StatementFormatterSettings) => void;
  onApply: (patch: CardCategoryPatch) => void;
}

export function CategoryImportComposer({
  card,
  cardType,
  earningRate,
  existingSubcategories,
  formatterSettings,
  onPersistSettings,
  onApply,
}: CategoryImportComposerProps) {
  const { notification } = useHaptics();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [termsUrl, setTermsUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const provider: CategoryImportProvider = formatterSettings?.categoryImportProvider ?? 'openai';
  const providerInfo = getCategoryImportProvider(provider);
  const model = formatterSettings?.modelByProvider?.[provider] || defaultModelFor(provider);
  const apiKey = formatterSettings?.apiKeys?.[provider] || '';
  const modelOptions = useMemo(() => {
    if (providerInfo.models.some((option) => option.value === model)) {
      return [...providerInfo.models];
    }
    return [{ value: model, label: model }, ...providerInfo.models];
  }, [model, providerInfo.models]);

  const persist = (update: {
    provider: CategoryImportProvider;
    model?: string;
    apiKey?: string;
  }) => {
    onPersistSettings(mergeCategoryImportCredentials(formatterSettings, update));
  };

  const create = async () => {
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    setError(null);
    persist({ provider, model, apiKey });
    try {
      const proposal = await requestMobileCategoryImport({
        provider,
        model,
        apiKey,
        cardType,
        instructions,
        termsUrl,
        earningRate,
        existingSubcategories,
      });
      onApply(applyCategoryProposal({
        card: { ...card, type: cardType, earningRate },
        proposal,
      }));
      setNotes(proposal.notes);
      setOpen(false);
      notification('success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create those categories.');
      notification('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {!open ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Create from terms"
          accessibilityHint="Opens a form that reads card terms and fills categories"
          style={({ pressed }) => [styles.openRow, pressed && styles.pressed]}
        >
          <Body color="action">Create from terms</Body>
        </Pressable>
      ) : (
        <View style={styles.form}>
          <View style={styles.choiceBlock}>
            <Headline>Provider</Headline>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {CATEGORY_IMPORT_PROVIDERS.map((option) => {
                const selected = option.id === provider;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => persist({ provider: option.id })}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: selected }}
                    style={({ pressed }) => [
                      styles.segmentOption,
                      selected && styles.segmentOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Caption1
                      color={selected ? 'inverse' : 'primary'}
                      style={styles.segmentLabel}
                    >
                      {option.label}
                    </Caption1>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.field, styles.rowDivider]}>
            <Headline>Model</Headline>
            <View accessibilityRole="radiogroup">
              {modelOptions.map((option) => {
                const selected = option.value === model;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => persist({ provider, model: option.value })}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: selected }}
                    style={({ pressed }) => [
                      styles.modelRow,
                      selected && styles.modelRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Body color={selected ? 'action' : 'primary'}>{option.label}</Body>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.field, styles.rowDivider]}>
            <Headline>API key</Headline>
            <TextInput
              value={apiKey}
              onChangeText={(value) => persist({ provider, apiKey: value })}
              placeholder={providerInfo.placeholder}
              placeholderTextColor={semanticColors.tertiaryLabel}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="API key"
              style={styles.input}
            />
            <Footnote color="secondary">Saved on this device.</Footnote>
            <Pressable
              onPress={() => void Linking.openURL(providerInfo.docsUrl)}
              accessibilityRole="link"
              accessibilityLabel={`Get a ${providerInfo.docsLabel} key`}
            >
              <Footnote color="action">Get a {providerInfo.docsLabel} key</Footnote>
            </Pressable>
          </View>

          <View style={[styles.field, styles.rowDivider]}>
            <Headline>Terms link</Headline>
            <TextInput
              value={termsUrl}
              onChangeText={setTermsUrl}
              placeholder="https://"
              placeholderTextColor={semanticColors.tertiaryLabel}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Terms link"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Headline>Instructions</Headline>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="e.g. UOB PPV, 4 mpd on contactless, exclude annual fee"
              placeholderTextColor={semanticColors.tertiaryLabel}
              multiline
              accessibilityLabel="Instructions"
              style={[styles.input, styles.multiline]}
            />
          </View>

          {error ? <Body color="destructive">{error}</Body> : null}

          <View style={styles.actions}>
            <Button
              variant="plain"
              size="medium"
              onPress={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="tinted"
              size="medium"
              onPress={() => void create()}
              disabled={busy || !apiKey.trim()}
            >
              {busy ? 'Reading terms…' : 'Create categories'}
            </Button>
          </View>
        </View>
      )}

      {notes.length > 0 ? (
        <View style={styles.notes}>
          {notes.map((note) => (
            <Footnote key={note} color="secondary">{note}</Footnote>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  openRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.large,
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  form: {
    borderRadius: radii.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  choiceBlock: {
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
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
    paddingHorizontal: spacing.xs,
    borderRadius: 7,
  },
  segmentOptionSelected: {
    backgroundColor: semanticColors.action,
  },
  segmentLabel: {
    textAlign: 'center',
    fontWeight: '600',
  },
  field: {
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.separator,
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
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  modelRow: {
    minHeight: nativeMetrics.minimumTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radii.small,
  },
  modelRowSelected: {
    backgroundColor: semanticColors.actionTint,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  notes: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
