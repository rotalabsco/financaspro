"use client";

import { useEffect, useState } from "react";
import { useMonth } from "@/contexts/MonthContext";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface CategoryRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  byMonth: Record<
    number,
    {
      previsto: number;
      realizado: number;
      realizadoEntries: {
        id: string;
        description: string;
        value: number;
        transactionDate: string | null;
      }[];
    }
  >;
  totalPrevisto: number;
  totalRealizado: number;
}

interface CellDetail {
  categoryName: string;
  categoryColor: string;
  monthNum: number;
  previsto: number;
  realizado: number;
  realizadoEntries: {
    id: string;
    description: string;
    value: number;
    transactionDate: string | null;
  }[];
}

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

export default function ResumoPage() {
  const { year: contextYear } = useMonth();
  const [year, setYear] = useState(contextYear);

  const [data, setData] = useState<{
    year: number;
    categories: CategoryRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cellDetail, setCellDetail] = useState<CellDetail | null>(null);

  useEffect(() => {
    setYear(contextYear);
  }, [contextYear]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/summary/annual?year=${year}`);
      if (res.ok) {
        const json = await res.json();
        setData({ year: json.year, categories: json.categories });
      }
      setLoading(false);
    }
    load();
  }, [year]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Resumo Anual</h1>
        <p className="mt-4 text-muted-foreground">Nenhum dado disponível.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Resumo Anual
        </h1>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="px-3 py-2 rounded-lg bg-background border border-border text-foreground"
        >
          {[year - 2, year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 font-medium text-muted-foreground label-style">
                Categoria
              </th>
              {MESES.map((m, i) => (
                <th key={m} className="text-right py-3 px-1 font-medium text-muted-foreground w-24">
                  {m}
                </th>
              ))}
              <th className="text-right py-3 px-2 font-medium text-muted-foreground w-28">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((cat) => (
              <tr key={cat.categoryId} className="border-b border-border/50 hover:bg-surface/50">
                <td className="py-2 px-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: cat.categoryColor }}
                  />
                  {cat.categoryName}
                </td>
                {MESES.map((_, i) => {
                  const m = i + 1;
                  const cell = cat.byMonth[m];
                  const val = cell?.realizado ?? cell?.previsto ?? 0;
                  const previsto = cell?.previsto ?? 0;
                  const realizado = cell?.realizado ?? 0;
                  const realizadoEntries = cell?.realizadoEntries ?? [];
                  return (
                    <td
                      key={m}
                      className="text-right py-2 px-1 font-mono-nums text-foreground cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() =>
                        setCellDetail({
                          categoryName: cat.categoryName,
                          categoryColor: cat.categoryColor,
                          monthNum: m,
                          previsto,
                          realizado,
                          realizadoEntries,
                        })
                      }
                    >
                      {val > 0 ? formatCurrency(val) : "—"}
                    </td>
                  );
                })}
                <td className="text-right py-2 px-2 font-mono-nums font-medium text-foreground">
                  {formatCurrency(cat.totalRealizado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cellDetail && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setCellDetail(null)}
          onKeyDown={(e) => e.key === "Escape" && setCellDetail(null)}
          role="button"
          tabIndex={0}
          aria-label="Fechar painel"
        >
          <aside
            className="card-surface absolute right-0 top-0 h-full w-80 max-w-[90vw] overflow-y-auto p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Detalhe da célula</h3>
              <button
                type="button"
                onClick={() => setCellDetail(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded-full"
                  style={{ backgroundColor: cellDetail.categoryColor }}
                />
                <span className="font-medium text-foreground">{cellDetail.categoryName}</span>
              </div>
              <p className="label-style text-muted-foreground">
                {MESES[cellDetail.monthNum - 1]} {data.year}
              </p>
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">Previsto</p>
                <p className="font-mono-nums text-foreground">{formatCurrency(cellDetail.previsto)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Realizado</p>
                <p className="font-mono-nums text-foreground">{formatCurrency(cellDetail.realizado)}</p>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">Lançamentos do realizado</p>
                <div className="space-y-2">
                  {cellDetail.realizadoEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
                  ) : (
                    cellDetail.realizadoEntries.map((entry) => (
                      <div key={entry.id} className="rounded border border-border p-2">
                        <p className="text-sm text-foreground">{entry.description}</p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(entry.transactionDate)}</span>
                          <span className="font-mono-nums text-foreground">
                            {formatCurrency(entry.value)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
