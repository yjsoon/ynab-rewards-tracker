import type { ComponentType, ReactNode } from 'react';

declare module 'tamagui' {
  type TamaguiConfig = Record<string, unknown>;
  type TamaguiComponentProps = Record<string, unknown>;

  interface TamaguiProviderProps {
    config: TamaguiConfig;
    children?: ReactNode;
  }

  interface ThemeProps {
    name?: string;
    children?: ReactNode;
  }

  export const TamaguiProvider: ComponentType<TamaguiProviderProps>;
  export const Theme: ComponentType<ThemeProps>;
  export const Button: ComponentType<TamaguiComponentProps>;
  export const Card: ComponentType<TamaguiComponentProps>;
  export const H1: ComponentType<TamaguiComponentProps>;
  export const H2: ComponentType<TamaguiComponentProps>;
  export const Paragraph: ComponentType<TamaguiComponentProps>;
  export const ScrollView: ComponentType<TamaguiComponentProps>;
  export const Separator: ComponentType<TamaguiComponentProps>;
  export const Text: ComponentType<TamaguiComponentProps>;
  export const XStack: ComponentType<TamaguiComponentProps>;
  export const YStack: ComponentType<TamaguiComponentProps>;
  export function createTamagui(config: TamaguiConfig): TamaguiConfig;
}
