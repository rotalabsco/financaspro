"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, RefreshCw, Ban } from "lucide-react";
import { promptEndSeriesMonth } from "@/lib/end-series-prompt";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

interface RecurringSeries {
  recurrenceGroupId: string;
  description: string;
  category: { id: string; name: string; color: string; isReceita: boolean };
  bankAccount: { id: string; name: string } | null;
  creditCard: { id: string; name: string } | null;
  source: string | null;
  isReceita: boolean;
  recurrenceEndsAtMonth: string | null;
  monthsCount: number;
  firstMonth: string;
  lastMonth: string;
  lastAmount: number;
  sampleTransactionId: string;
}

function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  return `${m}/${y}`;
}

export default function RecorrentesPage() {
  const [active, setActive] = useState<RecurringSeries[]>([]);
  const [ended, setEnded] = useState<RecurringSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recRes = await fetch("/api/recurring", { cache: "no-store" });
      if (recRes.ok) {
        const data = (await recRes.json()) as {
          active?: RecurringSeries[];
          ended?: RecurringSeries[];
          backfilled?: number;
        };
        setActive(Array.isArray(data.active) ? data.active : []);
        setEnded(Array.isArray(data.ended) ? data.ended : []);
        if ((data.backfilled ?? 0) > 0) {
          toast.info(`${data.backfilled} lançamento(s) legado(s) agrupados em séries.`);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEnd = async (series: RecurringSeries) => {
    const fromMonth = promptEndSeriesMonth(series.description);
    if (!fromMonth) return;
    setEndingId(series.recurrenceGroupId);
    try {
      const res = await fetch(`/api/recurring/${series.recurrenceGroupId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromMonth }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao encerrar série");
        return;
      }
      toast.success(data.message ?? "Série encerrada");
      await load();
    } finally {
      setEndingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando séries…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Recorrentes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Gerencie despesas recorrentes (assinaturas, mensalidades). Receitas ficam em{" "}
            <Link href="/dashboard/receitas" className="text-emerald-400 hover:underline">
              Receitas
            </Link>
            . A série aparece em todos os meses já criados e nos que forem criados depois; ao alterar
            o valor em um mês, os próximos usam o novo valor. Encerrar remove a série a partir do mês
            escolhido e impede que ela volte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>


      <section className="card-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Séries ativas ({active.length})</h2>
        </div>
        {active.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma série ativa.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Origem</th>
                  <th className="py-3 px-4">Período</th>
                  <th className="py-3 px-4 text-right">Último valor</th>
                  <th className="py-3 px-4 text-right">Meses</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.recurrenceGroupId} className="border-b border-border/50">
                    <td className="py-3 px-4">
                      <span className="text-foreground">{s.description}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-flex items-center gap-1.5"
                        style={{ color: s.category.color }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: s.category.color }}
                        />
                        {s.category.name}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {s.bankAccount?.name ?? s.creditCard?.name ?? s.source ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {formatMonthKey(s.firstMonth)} → {formatMonthKey(s.lastMonth)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">
                      {formatCurrency(s.lastAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">{s.monthsCount}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={endingId === s.recurrenceGroupId}
                        onClick={() => void handleEnd(s)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        title="Encerrar série a partir do último mês"
                      >
                        {endingId === s.recurrenceGroupId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        Encerrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Séries encerradas ({ended.length})
          </h2>
        </div>
        {ended.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma série encerrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Encerrou em</th>
                  <th className="py-3 px-4 text-right">Último valor</th>
                </tr>
              </thead>
              <tbody>
                {ended.map((s) => (
                  <tr key={s.recurrenceGroupId} className="border-b border-border/50 opacity-70">
                    <td className="py-3 px-4">{s.description}</td>
                    <td className="py-3 px-4">{s.category.name}</td>
                    <td className="py-3 px-4">
                      {s.recurrenceEndsAtMonth
                        ? formatMonthKey(s.recurrenceEndsAtMonth)
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">
                      {formatCurrency(s.lastAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
