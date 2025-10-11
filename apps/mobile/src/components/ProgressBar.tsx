import { YStack } from 'tamagui';

interface ProgressBarProps {
  value: number; // 0-100
  color?: string;
}

export function ProgressBar({ value, color = '$accent' }: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <YStack
      width="100%"
      height={8}
      backgroundColor="$backgroundHover"
      borderRadius="$2"
      overflow="hidden"
    >
      <YStack
        width={`${clampedValue}%`}
        height="100%"
        backgroundColor={color}
        borderRadius="$2"
      />
    </YStack>
  );
}