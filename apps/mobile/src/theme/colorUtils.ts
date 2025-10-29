import { processColor, type ColorValue } from 'react-native';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRgbaString(argb: number, overrideAlpha?: number): string {
  const a = typeof overrideAlpha === 'number'
    ? clamp(overrideAlpha, 0, 1)
    : ((argb >>> 24) & 0xff) / 255;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;

  const alpha = Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseHexColor(hex: string): number | null {
  const normalized = hex.replace('#', '').trim();

  if (normalized.length === 3) {
    const r = normalized[0];
    const g = normalized[1];
    const b = normalized[2];
    const expanded = `ff${r}${r}${g}${g}${b}${b}`;
    return parseInt(expanded, 16);
  }

  if (normalized.length === 6) {
    return parseInt(`ff${normalized}`, 16);
  }

  if (normalized.length === 8) {
    return parseInt(normalized, 16);
  }

  return null;
}

function stringToRgba(color: string, fallback: string, overrideAlpha?: number): string {
  const parsed = parseHexColor(color) ?? parseHexColor(fallback);
  if (parsed !== null) {
    return toRgbaString(parsed, overrideAlpha);
  }

  return color;
}

function resolveToRgba(color: ColorValue, fallback: string, overrideAlpha?: number): string {
  if (typeof color === 'string') {
    return stringToRgba(color, fallback, overrideAlpha);
  }

  if (typeof color === 'number') {
    return toRgbaString(color, overrideAlpha);
  }

  const processed = processColor(color);
  if (typeof processed === 'number') {
    return toRgbaString(processed, overrideAlpha);
  }

  return stringToRgba(fallback, fallback, overrideAlpha);
}

export function resolveColorValue(color: ColorValue, fallback: string): string {
  return resolveToRgba(color, fallback);
}

export function applyAlpha(color: ColorValue, fallback: string, alpha: number): string {
  return resolveToRgba(color, fallback, alpha);
}
