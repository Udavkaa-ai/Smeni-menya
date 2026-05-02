import { create } from 'zustand';

function startOfWeek(d) {
  const dt = new Date(d);
  const dow = dt.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diff);
  dt.setUTCHours(0, 0, 0, 0);
  return ymd(dt);
}

export function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

export const useWeekStore = create((set, get) => ({
  weekStart: startOfWeek(new Date()),
  toast: null,
  next: () => set({ weekStart: addDaysIso(get().weekStart, 7) }),
  prev: () => set({ weekStart: addDaysIso(get().weekStart, -7) }),
  goToday: () => set({ weekStart: startOfWeek(new Date()) }),
  setToast: (msg) => {
    set({ toast: msg });
    if (msg) setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 3000);
  },
}));
