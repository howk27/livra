import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export const useReducedMotion = (): boolean => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        setReducedMotion(value);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        if (mounted) {
          setReducedMotion(value);
        }
      }
    );

    return () => {
      mounted = false;
      if (subscription && 'remove' in subscription) {
        subscription.remove();
      }
    };
  }, []);

  return reducedMotion;
};


