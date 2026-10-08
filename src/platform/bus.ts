import { useSyncExternalStore } from 'react';

/** Tiny shared store for workspace-wide records (outbox, audit trail, attachments) that every suite writes to. */
export const createBus = <T,>(initial: T[] = []) => {
  let items: T[] = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    all: () => items,
    push: (...add: T[]) => {
      items = [...add, ...items];
      emit();
    },
    set: (next: T[]) => {
      items = next;
      emit();
    },
    use: () =>
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => items
      )
  };
};

export const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const pid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
