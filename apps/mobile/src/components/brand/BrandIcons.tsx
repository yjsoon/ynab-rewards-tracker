import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  type SvgProps,
} from 'react-native-svg';
import { brandColors, brandPalette, semanticColors } from '../../theme/semanticColors';

type AccessibleBrandIconProps = SvgProps & {
  /** Brand art is decorative by default; opt in when it carries meaning. */
  decorative?: boolean;
};

function accessibilityProps(
  decorative: boolean,
  accessibilityLabel: string | undefined,
  fallbackLabel: string,
) {
  if (decorative) {
    return {
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants' as const,
    };
  }

  return {
    accessible: true,
    accessibilityRole: 'image' as const,
    accessibilityLabel: accessibilityLabel ?? fallbackLabel,
  };
}

/**
 * Line-style card mark on lucide's 24pt grid. The card follows the current
 * system label colour while the progress terminal remains unmistakably ours.
 */
export function BrandMark({
  decorative = true,
  accessibilityLabel,
  color = semanticColors.label,
  ...props
}: AccessibleBrandIconProps) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...accessibilityProps(decorative, accessibilityLabel, 'Rewards Tracker')}
      {...props}
    >
      <Rect x={2} y={4.5} width={20} height={15} rx={3} />
      <Path d="M6 10.5h12" stroke={semanticColors.tertiaryLabel} />
      <Path d="M6 10.5h6" stroke={brandColors.action} />
      <Path d="M6 15.5h4" stroke={semanticColors.tertiaryLabel} />
      <Path
        d="M13.5 6.5 C13.9 9 15 10.1 17.5 10.5 C15 10.9 13.9 12 13.5 14.5 C13.1 12 12 10.9 9.5 10.5 C12 10.1 13.1 9 13.5 6.5 Z"
        fill={brandColors.spark}
        stroke="none"
      />
    </Svg>
  );
}

/** Full-colour, background-free brand card for empty and onboarding moments. */
export function BrandCard({
  decorative = true,
  accessibilityLabel,
  ...props
}: AccessibleBrandIconProps) {
  return (
    <Svg
      viewBox="80 140 352 232"
      width={176}
      height={116}
      {...accessibilityProps(decorative, accessibilityLabel, 'Rewards tracking card')}
      {...props}
    >
      <Defs>
        <LinearGradient id="mobile-brand-card-ember" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={brandPalette.crimson} />
          <Stop offset="1" stopColor={brandPalette.ember} />
        </LinearGradient>
      </Defs>
      <Rect
        x={82}
        y={146}
        width={348}
        height={220}
        rx={36}
        fill={brandPalette.charcoal}
        stroke={brandPalette.white}
        strokeOpacity={0.08}
        strokeWidth={2}
      />
      <Rect x={118} y={204} width={276} height={48} rx={24} fill={brandPalette.white} opacity={0.14} />
      <Rect x={118} y={204} width={168} height={48} rx={24} fill="url(#mobile-brand-card-ember)" />
      <Rect x={118} y={298} width={116} height={26} rx={13} fill={brandPalette.white} opacity={0.12} />
      <Path
        d="M286 166 C292 206 308 222 348 228 C308 234 292 250 286 290 C280 250 264 234 224 228 C264 222 280 206 286 166 Z"
        fill={brandPalette.spark}
      />
    </Svg>
  );
}

/** Concave four-point spark. Gold is fixed by the brand system. */
export function SparkIcon({
  decorative = true,
  accessibilityLabel,
  ...props
}: AccessibleBrandIconProps) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill={brandColors.spark}
      {...accessibilityProps(decorative, accessibilityLabel, 'Progress spark')}
      {...props}
    >
      <Path d="M12 3 C12.9 8.4 15.6 11.1 21 12 C15.6 12.9 12.9 15.6 12 21 C11.1 15.6 8.4 12.9 3 12 C8.4 11.1 11.1 8.4 12 3 Z" />
    </Svg>
  );
}

/** Dashed card and hollow terminal for a not-yet-started tracking state. */
export function EmptyCardsIcon({
  decorative = true,
  accessibilityLabel,
  color = semanticColors.secondaryLabel,
  ...props
}: AccessibleBrandIconProps) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...accessibilityProps(decorative, accessibilityLabel, 'No cards are being tracked')}
      {...props}
    >
      <Rect x={2} y={4.5} width={20} height={15} rx={3} strokeDasharray="3.2 3.2" />
      <Path d="M10.5 10.5H18" opacity={0.4} />
      <Path d="M6 15.5h4" opacity={0.4} />
      <Path
        d="M7 7.5 C7.3 9.4 8.1 10.2 10 10.5 C8.1 10.8 7.3 11.6 7 13.5 C6.7 11.6 5.9 10.8 4 10.5 C5.9 10.2 6.7 9.4 7 7.5 Z"
        stroke={brandColors.spark}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

export const EmptyMark = EmptyCardsIcon;
