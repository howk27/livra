import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { env } from '../lib/env';
import {
  hydrateDiagnosticsUnlock,
  setDiagnosticsUnlockedPersisted,
  subscribeDiagnosticsUnlock,
} from '../lib/dev/diagnosticsUnlock';

type DevToolsContextValue = {
  diagnosticsUnlocked: boolean;
  setDiagnosticsUnlocked: (unlocked: boolean) => void;
  allowMockData: boolean;
  enableDiagnosticsByDefault: boolean;
};

const DevToolsContext = createContext<DevToolsContextValue | null>(null);

export const DevToolsProvider = ({ children }: { children: React.ReactNode }) => {
  const [diagnosticsUnlockedState, setDiagnosticsUnlockedState] = useState(
    env.enableDiagnosticsByDefault
  );

  useEffect(() => {
    setDiagnosticsUnlockedPersisted(env.enableDiagnosticsByDefault);
  }, []);

  useEffect(() => {
    hydrateDiagnosticsUnlock().then((unlocked) => {
      setDiagnosticsUnlockedState(unlocked);
    });

    const eventSubscription = DeviceEventEmitter.addListener(
      'livra:diagnostics-unlock',
      (payload: { unlocked?: boolean } | undefined) => {
        const unlocked = payload?.unlocked === true;
        setDiagnosticsUnlockedPersisted(unlocked);
        setDiagnosticsUnlockedState(unlocked);
      }
    );

    const unsubscribe = subscribeDiagnosticsUnlock((unlocked) => {
      setDiagnosticsUnlockedState(unlocked);
    });

    return () => {
      eventSubscription.remove();
      unsubscribe();
    };
  }, []);

  const updateDiagnosticsUnlocked = (unlocked: boolean) => {
    setDiagnosticsUnlockedPersisted(unlocked);
    setDiagnosticsUnlockedState(unlocked);
  };

  const value = useMemo(
    () => ({
      diagnosticsUnlocked: diagnosticsUnlockedState,
      setDiagnosticsUnlocked: updateDiagnosticsUnlocked,
      allowMockData: env.allowMockData,
      enableDiagnosticsByDefault: env.enableDiagnosticsByDefault,
    }),
    [diagnosticsUnlockedState]
  );

  return <DevToolsContext.Provider value={value}>{children}</DevToolsContext.Provider>;
};

export const useDevTools = (): DevToolsContextValue => {
  const context = useContext(DevToolsContext);
  if (!context) {
    throw new Error('useDevTools must be used within DevToolsProvider');
  }
  return context;
};
