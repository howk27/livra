import { useEffect, useMemo, useState } from 'react';
import {
  FeatureFlag,
  getFlagValue,
  hydrateFlagOverrides,
  setFlagOverride,
  subscribeToFlags,
} from '../lib/experiments/flags';

export const useFeatureFlag = (flag: FeatureFlag): [boolean, (value: boolean) => void] => {
  const [value, setValue] = useState<boolean>(getFlagValue(flag));

  useEffect(() => {
    hydrateFlagOverrides();
    const unsubscribe = subscribeToFlags(() => {
      setValue(getFlagValue(flag));
    });
    return unsubscribe;
  }, [flag]);

  const update = useMemo(
    () => (next: boolean) => {
      void setFlagOverride(flag, next);
    },
    [flag]
  );

  return [value, update];
};
