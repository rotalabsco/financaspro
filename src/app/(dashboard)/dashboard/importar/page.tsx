"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Check, AlertTriangle, Download } from "lucide-react";
import type { ParsedMonth, ParsedTransaction, ParseResult } from "@/lib/import-types";

const MESES_NOMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

  const fileKey = (m: ParsedMonth) => `${m.year}-${m.month}`;
  const isSelected = (m: ParsedMonth) => selectedMonths.has(fileKey(m));

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setPreview(null);
    setError(null);
    setSelectedMonths(new Set());
    setApproved([]);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao processar");
      setPreview(data);
      setSelectedMonths(new Set(data.months.map((m: ParsedMonth) => fileKey(m))));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar arquivo");
    } finally {
      setLoading(false);
    }
  }, [file]);

  const toggleMonth = (m: ParsedMonth) => {
    const key = fileKey(m);
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApprove = useCallback(async () => {
    if (!preview || selectedMonths.size === 0) return;
    setApproving(true);
    setError(null);
    try {
      const toImport = preview.months.filter((m) => selectedMonths.has(fileKey(m)));
      const res = await fetch("/api/import/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: toImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao importar");
      toast.success(data.message ?? "Importação concluída com sucesso.");
      if (data.skipped?.length) {
        data.skipped.forEach((s: { year: number; month: number; reason: string }) => {
          toast.info(`${s.month}/${s.year}: ${s.reason}`);
        });
      }
      setApproved(toImport.map((m) => fileKey(m)));
      setSelectedMonths((prev) => {
        const next = new Set(prev);
        toImport.forEach((m) => next.delete(fileKey(m)));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setApproving(false);
    }
  }, [preview, selectedMonths]);

  return (
      <div className="space-y-6 animate-slide-in md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Importar Histórico
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importe seus dados pelo CSV do template e valide antes de salvar
          </p>
        </div>

        <a
          href="/api/import/template"
          download="template-importacao-financaspro.csv"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-[hsl(var(--surface-hover))] transition-colors"
        >
          <Download className="w-4 h-4" />
          Baixar template CSV
        </a>

        {/* Upload */}
        <div className="card-surface p-6 border-2 border-dashed border-border rounded-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <label className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg cursor-pointer hover:bg-primary/20 transition-colors">
              <Upload className="w-5 h-5" />
              <span className="text-sm font-medium">Selecionar arquivo</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="w-4 h-4" />
                <span>{file.name}</span>
                <span className="text-xs">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handlePreview}
              disabled={!file || loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processando..." : "Processar"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Use o arquivo .csv do template (disponível para download acima): uma linha por lançamento, com ano e mês em colunas próprias.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {preview?.warnings && preview.warnings.length > 0 && (
          <div className="flex items-start gap-2 p-4 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <ul className="list-disc list-inside space-y-1">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Preview por mês */}
        {preview && preview.months.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-foreground">
                Resumo por mês — validação macro
              </h2>
              <button
                type="button"
                onClick={handleApprove}
                disabled={selectedMonths.size === 0 || approving}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {approving ? "Importando..." : (
                  <>
                    <Check className="w-4 h-4" />
                    Importar {selectedMonths.size} mês(es) selecionado(s)
                  </>
                )}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {preview.months.map((m) => {
                const key = fileKey(m);
                const isApproved = approved.includes(key);
                const canSelect = !isApproved;
                return (
                  <div
                    key={key}
                    className={`card-surface p-4 rounded-xl border-2 transition-colors ${
                      isApproved
                        ? "border-green-500/30 bg-green-500/5"
                        : isSelected(m)
                          ? "border-primary"
                          : "border-transparent hover:border-border"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected(m)}
                        onChange={() => canSelect && toggleMonth(m)}
                        disabled={!canSelect}
                        className="mt-1 rounded border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">
                          {MESES_NOMES[m.month - 1]} {m.year}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {m.count} transação(ões)
                        </div>
                        <div className="text-sm mt-2 space-y-0.5">
                          <span className="text-muted-foreground block font-medium">
                            Despesas: {formatCurrency(m.totalDespesas ?? m.totalPrevisto)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            CC + Cartão (sem Dinheiro). Planilha: SUBTOTAL = 15.622,61 (com Dinheiro)
                          </span>
                          {(m.totalReceitas ?? 0) > 0 && (
                            <span className="block text-emerald-600 dark:text-emerald-400">
                              Receitas: {formatCurrency(m.totalReceitas)}
                            </span>
                          )}
                        </div>
                        {isApproved && (
                          <div className="flex items-center gap-1 mt-2 text-green-600 dark:text-green-400 text-xs">
                            <Check className="w-4 h-4" />
                            Importado
                          </div>
                        )}
                      </div>
                    </label>

                    {isSelected(m) && !isApproved && (
                      <details className="mt-3 pt-3 border-t border-border">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Ver {m.transactions.length} lançamentos
                        </summary>
                        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs">
                          {m.transactions.slice(0, 10).map((t: ParsedTransaction, i: number) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="truncate">{t.description}</span>
                              <span className="shrink-0">{formatCurrency(t.amountPrevisto)}</span>
                            </li>
                          ))}
                          {m.transactions.length > 10 && (
                            <li className="text-muted-foreground">
                              +{m.transactions.length - 10} mais...
                            </li>
                          )}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
  );
}
