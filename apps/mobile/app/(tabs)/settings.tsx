import { ScrollView } from 'react-native';
import { YStack, Card, H2, H6, Input, Button, Paragraph, Separator } from 'tamagui';

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
            <H6>YNAB Connection</H6>
            <Separator />

            <YStack gap="$2">
              <Paragraph size="$2" theme="alt1">
                Personal Access Token
              </Paragraph>
              <Input
                placeholder="Enter your YNAB PAT"
                secureTextEntry
                size="$4"
              />
            </YStack>

            <YStack gap="$2">
              <Paragraph size="$2" theme="alt1">
                Budget
              </Paragraph>
              <Input
                placeholder="Budget alias or ID"
                size="$4"
              />
            </YStack>

            <Button theme="blue" onPress={handleConnect} marginTop="$2">
              Connect to YNAB
            </Button>
          </YStack>
        </Card>

        <Card bordered padding="$4">
          <YStack gap="$2">
            <H6>About</H6>
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