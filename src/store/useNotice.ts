import { create } from 'zustand';

export interface Notice {
  text: string;
  tone: 'info' | 'error';
  link?: { href: string; label: string };
}

export const useNotice = create<{ notice: Notice | null; show: (n: Notice) => void; dismiss: () => void }>((set) => ({
  notice: null,
  show: (notice) => set({ notice }),
  dismiss: () => set({ notice: null }),
}));

export const notify = (text: string, extra: Partial<Notice> = {}) =>
  useNotice.getState().show({ text, tone: 'info', ...extra });
export const notifyError = (e: unknown) =>
  useNotice.getState().show({ text: e instanceof Error ? e.message : String(e), tone: 'error' });
