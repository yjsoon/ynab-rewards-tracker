# iOS Component Library

iOS-native components following Apple's Human Interface Guidelines. These components replace Tamagui with proper iOS design patterns.

## Design Principles

1. **Native Look & Feel**: Components match iOS Settings, Contacts, and Mail app designs
2. **Semantic Colors**: Uses `PlatformColor` for automatic light/dark mode support
3. **Dynamic Type**: Typography follows SF Pro Dynamic Type scale
4. **Accessibility**: Proper minimum touch targets (44pt) and semantic labels
5. **Performance**: Built on React Native primitives (View, Text, Pressable)

## Components

### Card
iOS grouped list container (replaces Tamagui Card)
```tsx
<Card>
  <ListItem>Content</ListItem>
</Card>
```

### ListItem
iOS list row with optional disclosure indicator
```tsx
<ListItem onPress={() => {}} showDisclosure>
  <Body>Settings Item</Body>
</ListItem>
```

### Button
iOS button with three variants: filled, tinted, plain
```tsx
<Button variant="filled" size="medium" onPress={() => {}}>
  Save
</Button>
```

### ProgressView
iOS progress bar (UIProgressView equivalent)
```tsx
<ProgressView value={0.75} />
```

### Typography
SF Pro text components with iOS type scale
```tsx
<LargeTitle>Screen Title</LargeTitle>
<Body>Body text content</Body>
<Footnote color="secondary">Small print</Footnote>
```

### SectionHeader
iOS-style section headers for grouped lists
```tsx
<SectionHeader>Account Settings</SectionHeader>
```

### Separator
iOS hairline divider
```tsx
<Separator inset={16} />
```

## Color System

All components use iOS semantic colors via `PlatformColor`:
- `label`, `secondaryLabel`, `tertiaryLabel`, `quaternaryLabel`
- `systemBackground`, `secondarySystemBackground`, `systemGroupedBackground`
- `separator`
- `systemBlue`, `systemGreen`, `systemRed`, etc.

## Typography Scale

iOS Dynamic Type sizes:
- **Large Title**: 34pt, bold (navigation bars)
- **Title 1**: 28pt, bold
- **Title 2**: 22pt, bold
- **Title 3**: 20pt, semibold
- **Headline**: 17pt, semibold
- **Body**: 17pt, regular (default)
- **Callout**: 16pt, regular
- **Subheadline**: 15pt, regular
- **Footnote**: 13pt, regular
- **Caption 1**: 12pt, regular
- **Caption 2**: 11pt, regular

## Migration Guide

### Tamagui → iOS Components

| Tamagui | iOS Component |
|---------|---------------|
| `<Card>` | `<Card>` |
| `<YStack>` / `<XStack>` | `<View style={{ flexDirection: 'column/row' }}>` |
| `<Text>` / `<Paragraph>` | `<Body>` / `<Footnote>` |
| `<H1>` / `<H2>` | `<LargeTitle>` / `<Title1>` |
| `<Button>` | `<Button variant="filled">` |
| `<Separator>` | `<Separator>` |
| Custom progress bar | `<ProgressView>` |

## Usage Example

```tsx
import { Card, ListItem, Body, Footnote, SectionHeader } from '@/components/ios';

<SectionHeader>Active Cards</SectionHeader>
<Card>
  <ListItem onPress={() => {}} showDisclosure>
    <Body>Chase Freedom Flex</Body>
    <Footnote color="secondary">$125.50 earned</Footnote>
  </ListItem>
  <ListItem onPress={() => {}} showDisclosure>
    <Body>Amex Gold</Body>
    <Footnote color="secondary">$89.20 earned</Footnote>
  </ListItem>
</Card>
```