import type { ComponentType, ReactNode } from 'react';

declare module 'tamagui' {
  export const TamaguiProvider: ComponentType<{ config: any; children?: ReactNode }>;
  export const Theme: ComponentType<{ name?: string; children?: ReactNode }>;
  export const Button: ComponentType<any>;
  export const Card: any;
  export const H1: ComponentType<any>;
  export const H2: ComponentType<any>;
  export const Paragraph: ComponentType<any>;
  export const ScrollView: ComponentType<any>;
  export const Separator: ComponentType<any>;
  export const Text: ComponentType<any>;
  export const XStack: ComponentType<any>;
  export const YStack: ComponentType<any>;
  export function createTamagui(config: any): any;
}
