import { ScrollView, TextInput } from 'react-native';
import { YStack, Card, H2, Text, Button, Paragraph, Separator } from 'tamagui';

export default function SettingsScreen() {
  // Placeholder – will wire real storage/API later
  const handleConnect = () => {
    console.log('Connect to YNAB clicked');
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <YStack padding="$4" gap="$4" backgroundColor="$background">
        <H2>Settings</H2>

        <Card elevate size="$4" bordered padding="$4">
          <YStack gap="$3">
            <Text fontSize="$6" fontWeight="700">YNAB Connection</Text>
            <Separator />

            <YStack gap="$2">
              <Paragraph size="$2" theme="alt1">
                Personal Access Token
              </Paragraph>
              <TextInput
                placeholder="Enter your YNAB PAT"
                secureTextEntry
                style={{ borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8 }}
              />
            </YStack>

            <YStack gap="$2">
              <Paragraph size="$2" theme="alt1">
                Budget
              </Paragraph>
              <TextInput
                placeholder="Budget alias or ID"
                style={{ borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8 }}
              />
            </YStack>

            <Button theme="blue" onPress={handleConnect} marginTop="$2">
              Connect to YNAB
            </Button>
          </YStack>
        </Card>

        <Card bordered padding="$4">
          <YStack gap="$2">
            <Text fontSize="$6" fontWeight="700">About</Text>
            <Separator />
            <Paragraph size="$2" theme="alt1">
              Version 0.1.0 (Demo Mode)
            </Paragraph>
            <Paragraph size="$2" theme="alt1">
              Built with Expo + Tamagui
            </Paragraph>
          </YStack>
        </Card>
      </YStack>
    </ScrollView>
  );
}