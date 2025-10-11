import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle, AccessibilityRole, AccessibilityValue } from 'react-native';
import { ChevronRight } from '@tamagui/lucide-icons';
import { useHaptics } from '../../hooks/useHaptics';
import { semanticColors } from '../../theme/semanticColors';

interface ListItemProps {
  children: React.ReactNode;
  onPress?: () => void;
  showDisclosure?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityValue?: AccessibilityValue;
  accessibilityRole?: AccessibilityRole;
}

/**
 * iOS-style list item with optional disclosure indicator
 * Matches iOS Settings/Contacts list row design
 */
export function ListItem({
  children,
  onPress,
  showDisclosure = false,
  isFirst = false,
  isLast = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  accessibilityRole,
}: ListItemProps) {
  const { selection } = useHaptics();

  const handlePress = onPress ? () => {
    selection();
    onPress();
  } : undefined;

  // Derive shared accessibility props
  const accessibilityProps = {
    accessible: !!(accessibilityLabel || accessibilityHint),
    accessibilityLabel,
    accessibilityHint,
    accessibilityValue,
    accessibilityRole: accessibilityRole || (handlePress ? 'button' : undefined),
  };

  const content = (
    <View style={[styles.container, style]}>
      <View style={styles.content}>{children}</View>
      {showDisclosure && (
        <ChevronRight
          size={18}
          color={semanticColors.systemGray3 as string}
          style={styles.disclosure}
        />
      )}
    </View>
  );

  if (handlePress) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.pressable,
          !isFirst && styles.borderTop,
          pressed && styles.pressed,
        ]}
        {...accessibilityProps}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.pressable, !isFirst && styles.borderTop]}
      {...accessibilityProps}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    backgroundColor: semanticColors.secondarySystemGroupedBackground,
  },
  pressed: {
    backgroundColor: semanticColors.tertiarySystemFill,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  content: {
    flex: 1,
  },
  disclosure: {
    marginLeft: 8,
  },
  borderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.separator,
  },
});