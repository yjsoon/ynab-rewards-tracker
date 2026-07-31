import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Body, Caption1, Footnote, Headline, ListItem } from '@/components/ios';
import { semanticColors, spacing } from '@/theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type SettingsRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  symbol?: SymbolName;
  symbolColor?: ComponentProps<typeof SymbolView>['tintColor'];
  trailing?: ReactNode;
  onPress?: () => void;
  isFirst?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function SettingsRow({
  title,
  subtitle,
  value,
  symbol,
  symbolColor = semanticColors.action,
  trailing,
  onPress,
  isFirst = false,
  destructive = false,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const resolvedAccessibilityLabel = accessibilityLabel ?? [title, value, subtitle]
    .filter(Boolean)
    .join(', ');

  return (
    <ListItem
      isFirst={isFirst}
      onPress={onPress}
      showDisclosure={Boolean(onPress) && !trailing}
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.row}>
        {symbol ? (
          <View style={styles.icon} accessibilityElementsHidden>
            <SymbolView name={symbol} size={19} weight="semibold" tintColor={symbolColor} />
          </View>
        ) : null}
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            {destructive ? (
              <Headline color="destructive" style={styles.title}>{title}</Headline>
            ) : (
              <Headline style={styles.title}>{title}</Headline>
            )}
            {value ? (
              <Body color="secondary" numberOfLines={1} style={styles.value}>
                {value}
              </Body>
            ) : null}
          </View>
          {subtitle ? (
            <Footnote color="secondary" style={styles.subtitle}>
              {subtitle}
            </Footnote>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </ListItem>
  );
}

export function SettingsFooter({ children }: { children: ReactNode }) {
  return (
    <Caption1 color="secondary" style={styles.footer}>
      {children}
    </Caption1>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.tertiarySystemFill,
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  trailing: {
    marginLeft: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
});
