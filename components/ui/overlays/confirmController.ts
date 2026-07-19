// Livra's own replacement for the destructive branch of `Alert.alert`.
//
// `confirm()` is a module-level singleton so it keeps the imperative ergonomics
// of Alert.alert — it can be awaited from anywhere, including nested callbacks
// and non-component helpers — while a single <ConfirmHost/> mounted at the root
// draws the actual Livra card. This keeps every confirmation on-brand without
// threading a context hook through every call site.

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Primary button label. Default "Confirm". */
  confirmLabel?: string;
  /** Quiet dismiss label. Default "Cancel". */
  cancelLabel?: string;
  /** Renders the primary action in Livra's danger style. */
  destructive?: boolean;
}

type ConfirmHandler = (opts: ConfirmOptions) => Promise<boolean>;

let handler: ConfirmHandler | null = null;

/** Internal — the mounted <ConfirmHost/> registers/unregisters itself here. */
export function _registerConfirmHandler(next: ConfirmHandler | null): void {
  handler = next;
}

/**
 * Ask the user to confirm an action. Resolves `true` when they confirm and
 * `false` when they cancel or dismiss.
 *
 * If no host is mounted (should never happen once the app tree is up), it
 * resolves `false` — a missing overlay can never green-light a destructive act.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (!handler) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[confirm] called before ConfirmHost mounted — defaulting to false');
    }
    return Promise.resolve(false);
  }
  return handler(opts);
}
