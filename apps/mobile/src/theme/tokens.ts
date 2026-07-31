/** Layout primitives shared by the native mobile component layer. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 22,
  pill: 999,
} as const;

export const nativeMetrics = {
  minimumTouchTarget: 44,
  screenGutter: 20,
  railHeight: 8,
  hairlineInset: 44,
} as const;

/** Opacity-only feedback is intentionally safe when Reduce Motion is enabled. */
export const interaction = {
  pressedOpacity: 0.72,
  subtlePressedOpacity: 0.82,
  disabledOpacity: 0.38,
} as const;
