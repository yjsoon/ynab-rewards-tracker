import React from 'react';
import { ScrollView, TextInput, KeyboardAvoidingView, Platform, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useHaptics } from '@/hooks/useHaptics';
import { Card, ListItem, Button, Footnote, SectionHeader, Separator } from '@/components/ios';
import { semanticColors } from '@/theme/semanticColors';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { impact, notification } = useHaptics();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitle: true,
      title: 'Settings',
    });
  }, [navigation]);

  const handleConnect = () => {
    impact('heavy');
    // Simulate connection attempt
    setTimeout(() => {
      notification('success');
      console.log('Connect to YNAB clicked');
    }, 500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <SectionHeader>YNAB Connection</SectionHeader>
            <Card>
              <ListItem>
                <View style={styles.fieldGroup}>
                  <Footnote color="secondary">Personal Access Token</Footnote>
                  <TextInput
                    placeholder="Enter your YNAB PAT"
                    secureTextEntry
                    style={styles.textInput}
                    placeholderTextColor={semanticColors.tertiaryLabel}
                    onFocus={() => impact('light')}
                  />
                </View>
              </ListItem>

              <Separator inset={16} />

              <ListItem>
                <View style={styles.fieldGroup}>
                  <Footnote color="secondary">Budget</Footnote>
                  <TextInput
                    placeholder="Budget alias or ID"
                    style={styles.textInput}
                    placeholderTextColor={semanticColors.tertiaryLabel}
                    onFocus={() => impact('light')}
                  />
                </View>
              </ListItem>

              <Separator inset={16} />

              <ListItem>
                <Button
                  variant="filled"
                  size="medium"
                  onPress={handleConnect}
                  style={styles.connectButton}
                  accessibilityLabel="Connect to YNAB"
                  accessibilityHint="Connects your YNAB account using the personal access token"
                >
                  Connect to YNAB
                </Button>
              </ListItem>
            </Card>

            <SectionHeader>About</SectionHeader>
            <Card>
              <ListItem>
                <View style={styles.aboutInfo}>
                  <Footnote color="secondary">Version 0.1.0 (Demo Mode)</Footnote>
                  <Footnote color="secondary">Built with Expo + React Native</Footnote>
                </View>
              </ListItem>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  content: {
    gap: 8,
  },
  fieldGroup: {
    gap: 8,
    width: '100%',
  },
  textInput: {
    borderWidth: 1,
    borderColor: semanticColors.separator,
    backgroundColor: semanticColors.tertiarySystemBackground,
    padding: 12,
    borderRadius: 8,
    fontSize: 17,
    color: semanticColors.label,
  },
  connectButton: {
    width: '100%',
  },
  aboutInfo: {
    gap: 8,
  },
});