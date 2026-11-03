"use client";

import { useState } from "react";
import { useMonth } from "@/contexts/MonthContext";
import { ChevronLeft, ChevronRight, ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function AppHeader() {
  const router = useRouter();
  const { year, month, months, goPrev, goNext, setYearMonth, refetchMonths } = useMonth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const handleSelectMonth = async (y: number, m: number) => {
    const exists = months.some((mo) => mo.year === y && mo.month === m);
    if (exists) {
      await setYearMonth(y, m);
      setDropdownOpen(false);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: y, month: m }),
      });
      if (res.ok || res.status === 409) {
        await refetchMonths();
        await setYearMonth(y, m);
      }
    } finally {
      setCreating(false);
      setDropdownOpen(false);
    }
  };

  const label = `${MONTHS[month - 1]} ${year}`;
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: 12 },
    (_, i) => currentYear + 2 - i
  );

  return (
    <header className="sticky top-0 z-10 glass border-b border-border">
      <div className="flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              className="p-2 rounded-lg hover:bg-[hsl(var(--surface-hover))] text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1 min-w-[120px] px-2 py-1.5 rounded-lg hover:bg-[hsl(var(--surface-hover))] font-semibold text-foreground"
              >
                <span>{label}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDropdownOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute top-full left-0 mt-1 z-20 w-48 max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                    {years.map((y) =>
                      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                        const lab = `${MONTHS[m - 1]} ${y}`;
                        const isSelected = year === y && month === m;
                        return (
                          <button
                            key={`${y}-${m}`}
                            type="button"
                            onClick={() => handleSelectMonth(y, m)}
                            disabled={creating}
                            className={`block w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--surface-hover))] ${
                              isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                            }`}
                          >
                            {lab}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => goNext()}
              className="p-2 rounded-lg hover:bg-[hsl(var(--surface-hover))] text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-[hsl(var(--surface-hover))] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
