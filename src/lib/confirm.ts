// In-app confirmation dialog (replaces the browser's native confirm()).
// Usage: if (!(await confirmDialog({ title: 'Delete Vios?', message: '…', confirmLabel: 'Delete', danger: true }))) return;
import { shallowRef } from 'vue';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deleting or discarding. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

export const pendingConfirm = shallowRef<Pending | null>(null);

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pendingConfirm.value?.resolve(false); // only one dialog at a time
  return new Promise(resolve => {
    pendingConfirm.value = { ...options, resolve };
  });
}

export function settleConfirm(ok: boolean) {
  const p = pendingConfirm.value;
  pendingConfirm.value = null;
  p?.resolve(ok);
}
