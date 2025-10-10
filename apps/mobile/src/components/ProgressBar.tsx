import { styled, YStack } from 'tamagui';

interface ProgressBarProps {
  value: number; // 0-100
  color?: string;
}

const ProgressTrack = styled(YStack, {
  width: '100%',
  height: 8,
  backgroundColor: '$backgroundHover',
  borderRadius: '$2',
  overflow: 'hidden',
});

const ProgressFill = styled(YStack, {
  height: '100%',
  borderRadius: '$2',
});

export function ProgressBar({ value, color = '$accent' }: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <ProgressTrack>
      <ProgressFill width={`${clampedValue}%`} backgroundColor={color} />
    </ProgressTrack>
  );
}