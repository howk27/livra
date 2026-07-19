// Livra's own replacement for the multi-button, menu-style `Alert.alert`
// (e.g. the mark long-press menu: View details / Edit / Delete). Same singleton
// approach as `confirm()` — awaitable from anywhere, drawn by one host.

export interface ActionSheetAction {
  label: string;
  /** Renders the row in Livra's danger color. */
  destructive?: boolean;
}

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  actions: ActionSheetAction[];
  /** Quiet dismiss label. Default "Cancel". */
  cancelLabel?: string;
}

type ActionSheetHandler = (opts: ActionSheetOptions) => Promise<number>;

let handler: ActionSheetHandler | null = null;

/** Internal — the mounted <ActionSheetHost/> registers/unregisters itself here. */
export function _registerActionSheetHandler(next: ActionSheetHandler | null): void {
  handler = next;
}

/**
 * Present a Livra bottom-sheet menu. Resolves the index of the chosen action,
 * or `-1` if the user cancels or dismisses. Resolves `-1` when no host is
 * mounted, so nothing runs by accident.
 */
export function actionSheet(opts: ActionSheetOptions): Promise<number> {
  if (!handler) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[actionSheet] called before ActionSheetHost mounted — defaulting to -1');
    }
    return Promise.resolve(-1);
  }
  return handler(opts);
}
