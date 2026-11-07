"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Ban, RefreshCw } from "lucide-react";
import { promptEndSeriesMonth } from "@/lib/end-series-prompt";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  return `${m}/${y}`;
}

function currentCompetencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseCurrencyBR(raw: string): number {
  const normalized = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

interface BankAccount {
  id: string;
  name: string;
  institution: string | null;
}

interface ReceitaSeries {
  recurrenceGroupId: string;
  description: string;
  category: { id: string; name: string; color: string; isReceita: boolean };
  bankAccount: { id: string; name: string } | null;
  type: string;
  recurrenceEndsAtMonth: string | null;
  monthsCount: number;
  firstMonth: string;
  lastMonth: string;
  lastAmount: number;
  sampleTransactionId: string;
}

interface Avulso {
  id: string;
  description: string;
  bankAccount: { id: string; name: string } | null;
  month: string;
  amount: number;
  isConciliado: boolean;
}

export default function ReceitasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[200px] gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando receitas…
        </div>
      }
    >
      <ReceitasPageInner />
    </Suspense>
  );
}

function ReceitasPageInner() {
  const searchParams = useSearchParams();
  const groupFromUrl = searchParams.get("group");

  const [seriesAtivas, setSeriesAtivas] = useState<ReceitaSeries[]>([]);
  const [seriesEncerradas, setSeriesEncerradas] = useState<ReceitaSeries[]>([]);
  const [avulsos, setAvulsos] = useState<Avulso[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightGroup, setHighlightGroup] = useState<string | null>(groupFromUrl);

  const [showCreate, setShowCreate] = useState(false);
  const [description, setDescription] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"A_VISTA" | "RECORRENTE">("RECORRENTE");
  const [competencia, setCompetencia] = useState(currentCompetencia);
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState<ReceitaSeries | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editFrom, setEditFrom] = useState(currentCompetencia);
  const [endingId, setEndingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/receitas", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Erro ao carregar receitas");
        return;
      }
      const data = (await res.json()) as {
        seriesAtivas?: ReceitaSeries[];
        seriesEncerradas?: ReceitaSeries[];
        avulsos?: Avulso[];
        bankAccounts?: BankAccount[];
      };
      setSeriesAtivas(Array.isArray(data.seriesAtivas) ? data.seriesAtivas : []);
      setSeriesEncerradas(Array.isArray(data.seriesEncerradas) ? data.seriesEncerradas : []);
      setAvulsos(Array.isArray(data.avulsos) ? data.avulsos : []);
      const accounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
      setBankAccounts(accounts);
      setBankAccountId((prev) => prev || accounts[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (s: ReceitaSeries) => {
    setEditing(s);
    setEditAmount(s.lastAmount.toFixed(2).replace(".", ","));
    setEditFrom(s.lastMonth || currentCompetencia());
    setHighlightGroup(s.recurrenceGroupId);
  };

  useEffect(() => {
    if (!groupFromUrl || loading || seriesAtivas.length === 0) return;
    const match = seriesAtivas.find((s) => s.recurrenceGroupId === groupFromUrl);
    if (match) {
      setEditing(match);
      setEditAmount(match.lastAmount.toFixed(2).replace(".", ","));
      setEditFrom(match.lastMonth || currentCompetencia());
      setHighlightGroup(groupFromUrl);
    }
  }, [groupFromUrl, loading, seriesAtivas]);

  const competenciaOptions = useMemo(() => {
    const now = new Date();
    const opts: string[] = [];
    for (let i = -6; i <= 12; i++) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
      opts.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      );
    }
    return opts;
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseCurrencyBR(amount);
    if (!description.trim() || !bankAccountId || val <= 0) {
      toast.error("Preencha descrição, conta e valor.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/receitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          bankAccountId,
          amount: val,
          type,
          competencia,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao criar receita");
        return;
      }
      toast.success(
        data.message ??
          `Receita criada em ${formatMonthKey(competencia)}. Abra esse mês em Lançamentos para conferir.`
      );
      setShowCreate(false);
      setDescription("");
      setAmount("");
      setType("RECORRENTE");
      setCompetencia(currentCompetencia());
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const val = parseCurrencyBR(editAmount);
    if (val <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/receitas/${editing.recurrenceGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: val,
          fromCompetencia: editFrom,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao atualizar");
        return;
      }
      toast.success(data.message ?? "Receita atualizada");
      setEditing(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnd = async (s: ReceitaSeries) => {
    const fromMonth = promptEndSeriesMonth(s.description);
    if (!fromMonth) return;
    setEndingId(s.recurrenceGroupId);
    try {
      const res = await fetch(`/api/recurring/${s.recurrenceGroupId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromMonth }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao encerrar");
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
        Carregando receitas…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Receitas</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cadastre salários e outras entradas no padrão. Ao mudar o valor, informe a
            competência a partir da qual a mudança vale — meses anteriores ficam iguais e os
            seguintes acompanham o novo valor.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Nova receita
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="card-surface p-4 space-y-3 max-w-xl border border-emerald-500/30"
        >
          <h2 className="text-sm font-medium">Nova receita</h2>
          <div>
            <label className="block label-style mb-1">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border"
              placeholder="Ex.: Salário"
              required
            />
          </div>
          <div>
            <label className="block label-style mb-1">Conta destino</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border"
              required
            >
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution ? `${a.name} (${a.institution})` : a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block label-style mb-1">Valor</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border"
                placeholder="0,00"
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <label className="block label-style mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "A_VISTA" | "RECORRENTE")}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border"
              >
                <option value="RECORRENTE">Recorrente</option>
                <option value="A_VISTA">À vista (só este mês)</option>
              </select>
            </div>
            <div>
              <label className="block label-style mb-1">Competência</label>
              <select
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border"
              >
                {competenciaOptions.map((c) => (
                  <option key={c} value={c}>
                    {formatMonthKey(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-sm rounded-lg border border-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50"
            >
              {submitting ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <form
          onSubmit={handleEdit}
          className="card-surface p-4 space-y-3 max-w-xl border border-blue-500/30"
        >
          <h2 className="text-sm font-medium">Alterar valor — {editing.description}</h2>
          <p className="text-xs text-muted-foreground">
            Informe a competência a partir da qual o novo valor vale. Meses anteriores não mudam.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block label-style mb-1">Novo valor</label>
              <input
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border"
                required
              />
            </div>
            <div>
              <label className="block label-style mb-1">A partir da competência</label>
              <select
                value={editFrom}
                onChange={(e) => setEditFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border"
              >
                {competenciaOptions.map((c) => (
                  <option key={c} value={c}>
                    {formatMonthKey(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-3 py-2 text-sm rounded-lg border border-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50"
            >
              {submitting ? "Aplicando…" : "Aplicar da competência em diante"}
            </button>
          </div>
        </form>
      )}

      <section className="card-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">
            Receitas recorrentes ativas ({seriesAtivas.length})
          </h2>
        </div>
        {seriesAtivas.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhuma receita recorrente. Use &quot;Nova receita&quot; com tipo Recorrente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Conta</th>
                  <th className="py-3 px-4">Período</th>
                  <th className="py-3 px-4 text-right">Último valor</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {seriesAtivas.map((s) => (
                  <tr
                    key={s.recurrenceGroupId}
                    className={`border-b border-border/50 ${
                      highlightGroup === s.recurrenceGroupId
                        ? "bg-emerald-500/10"
                        : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-foreground">{s.description}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {s.bankAccount?.name ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {formatMonthKey(s.firstMonth)} → {formatMonthKey(s.lastMonth)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-emerald-400">
                      {formatCurrency(s.lastAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Valor
                        </button>
                        <button
                          type="button"
                          disabled={endingId === s.recurrenceGroupId}
                          onClick={() => void handleEnd(s)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {endingId === s.recurrenceGroupId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          Encerrar
                        </button>
                      </div>
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
            À vista recentes ({avulsos.length})
          </h2>
        </div>
        {avulsos.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma receita à vista recente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-3 px-4">Competência</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Conta</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {avulsos.map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-3 px-4">{formatMonthKey(a.month)}</td>
                    <td className="py-3 px-4">{a.description}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {a.bankAccount?.name ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums">
                      {formatCurrency(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {seriesEncerradas.length > 0 && (
        <section className="card-surface overflow-hidden opacity-80">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Encerradas ({seriesEncerradas.length})
            </h2>
          </div>
          <ul className="divide-y divide-border/50 text-sm">
            {seriesEncerradas.map((s) => (
              <li key={s.recurrenceGroupId} className="px-4 py-3 flex justify-between gap-2">
                <span>{s.description}</span>
                <span className="text-muted-foreground text-xs">
                  até {s.recurrenceEndsAtMonth ? formatMonthKey(s.recurrenceEndsAtMonth) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
