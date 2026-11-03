"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

export type MonthListItem = {
  id: string;
  year: number;
  month: number;
  status?: string;
  /** Lançamentos com conciliação marcada (para mês “em uso” no carregamento). */
  reconciledCount?: number;
};

function monthKey(m: { year: number; month: number }): number {
  return m.year * 12 + m.month;
}

/**
 * Mês exibido ao carregar / F5: após o último mês fechado (ex.: abr/26 se mar/26 fechou),
 * senão o mais recente (cronologicamente) ainda aberto com lançamentos conciliados
 * (ex.: mar/26 com dados, não out/2028 vazio).
 */
export function computeDefaultMonthIndex(months: MonthListItem[]): number {
  if (months.length === 0) return 0;

  type Enriched = MonthListItem & {
    idx: number;
    key: number;
    reconciledCount: number;
    isClosed: boolean;
  };

  const enriched: Enriched[] = months.map((m, idx) => ({
    ...m,
    idx,
    key: monthKey(m),
    reconciledCount: m.reconciledCount ?? 0,
    isClosed: m.status === "FECHADO",
  }));

  const chrono = [...enriched].sort((a, b) => a.key - b.key);

  const closedMonths = chrono.filter((m) => m.isClosed);
  const lastClosed =
    closedMonths.length > 0
      ? closedMonths.reduce((a, b) => (a.key > b.key ? a : b))
      : null;

  if (lastClosed) {
    const after = chrono.find((m) => m.key > lastClosed.key && !m.isClosed);
    if (after) return after.idx;
  }

  const openWithRecon = chrono.filter((m) => !m.isClosed && m.reconciledCount > 0);
  if (openWithRecon.length > 0) {
    const best = openWithRecon.reduce((a, b) => (a.key > b.key ? a : b));
    return best.idx;
  }

  const openMonths = chrono.filter((m) => !m.isClosed);
  if (openMonths.length > 0) {
    const newestOpen = openMonths.reduce((a, b) => (a.key > b.key ? a : b));
    return newestOpen.idx;
  }

  return 0;
}

type MonthContextType = {
  months: MonthListItem[];
  selectedIndex: number;
  selectedMonth: MonthListItem | null;
  year: number;
  month: number;
  goPrev: () => void;
  goNext: () => void;
  setYearMonth: (year: number, month: number) => Promise<void>;
  refetchMonths: () => Promise<void>;
};

const MonthContext = createContext<MonthContextType | null>(null);

async function fetchMonthsList(): Promise<MonthListItem[]> {
  const res = await fetch("/api/months");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const [months, setMonths] = useState<MonthListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const initialDefaultApplied = useRef(false);

  const refetchMonths = useCallback(async () => {
    const list = await fetchMonthsList();
    setMonths(list);
    if (!initialDefaultApplied.current) {
      initialDefaultApplied.current = true;
      setSelectedIndex(computeDefaultMonthIndex(list));
    } else {
      setSelectedIndex((prev) =>
        Math.min(prev, Math.max(0, list.length - 1))
      );
    }
  }, []);

  useEffect(() => {
    refetchMonths();
  }, [refetchMonths]);

  const selectedMonth = months[selectedIndex] ?? null;
  const year = selectedMonth?.year ?? new Date().getFullYear();
  const month = selectedMonth?.month ?? new Date().getMonth() + 1;

  // Array ordenado: [mais recente, ..., mais antigo]. Índice maior = mês anterior (passado).
  const goPrev = useCallback(() => {
    setSelectedIndex((i) => Math.min(months.length - 1, i + 1));
  }, [months.length]);

  const goNext = useCallback(async () => {
    const current = months[selectedIndex];
    if (!current) return;
    const nextMonth = current.month === 12 ? 1 : current.month + 1;
    const nextYear = current.month === 12 ? current.year + 1 : current.year;
    const exists = months.some((m) => m.year === nextYear && m.month === nextMonth);
    if (exists) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    const list = await fetchMonthsList();
    setMonths(list);
    const idx = list.findIndex((m) => m.year === nextYear && m.month === nextMonth);
    if (idx >= 0) {
      setSelectedIndex(idx);
      return;
    }
    try {
      const res = await fetch("/api/months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: nextYear, month: nextMonth }),
      });
      if (res.ok) {
        const created = await res.json();
        const refreshed = await fetchMonthsList();
        setMonths(refreshed);
        const newIdx = refreshed.findIndex((m) => m.id === created.id);
        if (newIdx >= 0) setSelectedIndex(newIdx);
      }
    } catch {
      // silenciar - criar mês é opcional para navegação
    }
  }, [months, selectedIndex]);

  const setYearMonth = useCallback(async (y: number, m: number) => {
    const list = await fetchMonthsList();
    setMonths(list);
    const idx = list.findIndex((mo) => mo.year === y && mo.month === m);
    if (idx >= 0) setSelectedIndex(idx);
  }, []);

  return (
    <MonthContext.Provider
      value={{
        months,
        selectedIndex,
        selectedMonth,
        year,
        month,
        goPrev,
        goNext,
        setYearMonth,
        refetchMonths,
      }}
    >
      {children}
    </MonthContext.Provider>
  );
}

export function useMonth() {
  const ctx = useContext(MonthContext);
  if (!ctx) {
    throw new Error("useMonth must be used within MonthProvider");
  }
  return ctx;
}
