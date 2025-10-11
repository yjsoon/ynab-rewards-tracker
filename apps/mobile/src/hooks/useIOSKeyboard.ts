import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

interface KeyboardInfo {
  isVisible: boolean;
  height: number;
}

/**
 * iOS keyboard hook
 * Tracks keyboard visibility and height with iOS-specific events
 */
export function useIOSKeyboard(): KeyboardInfo {
  const [keyboardInfo, setKeyboardInfo] = useState<KeyboardInfo>({
    isVisible: false,
    height: 0,
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const handleKeyboardWillShow = (e: KeyboardEvent) => {
      setKeyboardInfo({
        isVisible: true,
        height: e.endCoordinates.height,
      });
    };

    const handleKeyboardWillHide = () => {
      setKeyboardInfo({
        isVisible: false,
        height: 0,
      });
    };

    const showSubscription = Keyboard.addListener('keyboardWillShow', handleKeyboardWillShow);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', handleKeyboardWillHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return keyboardInfo;
}