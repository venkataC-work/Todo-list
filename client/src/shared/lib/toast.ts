import { createObservable } from './observable';

export type ToastTone = 'error' | 'success';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; to: string };
}

export const toasts = createObservable<Toast[]>([]);

let nextId = 0;

export const dismissToast = (id: number) => toasts.set((list) => list.filter((t) => t.id !== id));

export const notify = (
  message: string,
  tone: ToastTone = 'error',
  durationMs = 4000,
  action?: Toast['action'],
) => {
  const id = ++nextId;
  toasts.set((list) => [...list, { id, message, tone, action }]);
  setTimeout(() => dismissToast(id), durationMs);
};
