import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LivraActionSheet } from './LivraActionSheet';
import { _registerActionSheetHandler, type ActionSheetOptions } from './actionSheetController';

/**
 * Mounted once at the app root. Registers the handler behind the global
 * `actionSheet()` helper and renders the Livra bottom-sheet menu on request.
 * Single-slot, like ConfirmHost — a new request supersedes any open one (-1).
 */
export function ActionSheetHost() {
  const [opts, setOpts] = useState<ActionSheetOptions | null>(null);
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((index: number) => void) | null>(null);

  useEffect(() => {
    _registerActionSheetHandler(
      (next) =>
        new Promise<number>((resolve) => {
          resolveRef.current?.(-1);
          resolveRef.current = resolve;
          setOpts(next);
          setVisible(true);
        }),
    );
    return () => _registerActionSheetHandler(null);
  }, []);

  const finish = useCallback((index: number) => {
    setVisible(false);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(index);
  }, []);

  if (!opts) return null;

  return (
    <LivraActionSheet
      visible={visible}
      title={opts.title}
      message={opts.message}
      actions={opts.actions}
      cancelLabel={opts.cancelLabel ?? 'Cancel'}
      onSelect={(index) => finish(index)}
      onCancel={() => finish(-1)}
    />
  );
}
