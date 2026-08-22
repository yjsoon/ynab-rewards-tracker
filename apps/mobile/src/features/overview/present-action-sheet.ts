import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface ActionSheetItem {
  label: string;
  run: () => void;
}

export function presentActionSheet(params: {
  title?: string;
  actions: ActionSheetItem[];
}): void {
  const { title, actions } = params;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...actions.map((action) => action.label), 'Cancel'],
        cancelButtonIndex: actions.length,
      },
      (buttonIndex) => {
        const action = typeof buttonIndex === 'number' ? actions[buttonIndex] : undefined;
        action?.run();
      },
    );
    return;
  }

  Alert.alert(title ?? 'Actions', undefined, [
    ...actions.map((action) => ({ text: action.label, onPress: action.run })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}
