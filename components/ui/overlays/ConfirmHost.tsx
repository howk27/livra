import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { _registerConfirmHandler, type ConfirmOptions } from './confirmController';

/**
 * Mounted once at the app root. Registers the handler behind the global
 * `confirm()` helper and renders the Livra ConfirmDialog when a confirmation is
 * requested. Confirmations are modal and sequential, so a single slot is enough
 * — if a second confirm arrives while one is open, the first resolves false.
 */
export function ConfirmHost() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

  useEffect(() => {
    _registerConfirmHandler(
      (next) =>
        new Promise<boolean>((resolve) => {
          // Any confirmation still awaiting a decision loses to the new one.
          resolveRef.current?.(false);
          resolveRef.current = resolve;
          setOpts(next);
          setVisible(true);
        }),
    );
    return () => _registerConfirmHandler(null);
  }, []);

  const finish = useCallback((result: boolean) => {
    setVisible(false);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }, []);

  if (!opts) return null;

  return (
    <ConfirmDialog
      visible={visible}
      title={opts.title}
      message={opts.message}
      confirmLabel={opts.confirmLabel ?? 'Confirm'}
      cancelLabel={opts.cancelLabel ?? 'Cancel'}
      destructive={opts.destructive}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );
}
