import React, { useEffect } from 'react';
import { hydrateFlagOverrides } from '../lib/experiments/flags';

export const ExperimentsProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    hydrateFlagOverrides();
  }, []);

  return <>{children}</>;
};
