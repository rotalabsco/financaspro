"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function SystemConfigModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [systemInitial, setSystemInitial] = useState({ year: 2026, month: 1 });
  const [forecastReference, setForecastReference] = useState({ year: 2026, month: 4 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/system")
      .then((r) => r.json())
      .then((data) => {
        if (data.systemInitial) setSystemInitial(data.systemInitial);
        if (data.forecastReference) setForecastReference(data.forecastReference);
      })
      .catch(() => toast.error("Erro ao carregar configuração"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const si = systemInitial.year * 12 + systemInitial.month;
    const fr = forecastReference.year * 12 + forecastReference.month;
    if (fr < si) {
      toast.error("O mês de referência para previsão deve ser igual ou posterior ao mês inicial.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInitial,
          forecastReference,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erro ao salvar");
        return;
      }
      toast.success("Configuração salva");
      onSuccess?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="card-surface w-full max-w-md p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Configuração do Sistema
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Defina o mês inicial do sistema e até qual mês há dados reais. A previsão será aplicada apenas em meses posteriores ao de referência.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
        ) : (
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Mês inicial do sistema
              </label>
              <p className="text-xs text-muted-foreground mb-1">
                Primeiro mês controlado no app. Meses anteriores podem ser preenchidos depois para histórico.
              </p>
              <div className="flex gap-2">
                <select
                  value={systemInitial.month}
                  onChange={(e) =>
                    setSystemInitial((p) => ({ ...p, month: parseInt(e.target.value, 10) }))
                  }
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                >
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={systemInitial.year}
                  onChange={(e) =>
                    setSystemInitial((p) => ({ ...p, year: parseInt(e.target.value, 10) || p.year }))
                  }
                  min={2020}
                  max={2100}
                  className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Mês de referência para previsão
              </label>
              <p className="text-xs text-muted-foreground mb-1">
                Último mês com dados reais. A previsão será aplicada apenas em meses posteriores a este.
              </p>
              <div className="flex gap-2">
                <select
                  value={forecastReference.month}
                  onChange={(e) =>
                    setForecastReference((p) => ({ ...p, month: parseInt(e.target.value, 10) }))
                  }
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                >
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={forecastReference.year}
                  onChange={(e) =>
                    setForecastReference((p) => ({ ...p, year: parseInt(e.target.value, 10) || p.year }))
                  }
                  min={2020}
                  max={2100}
                  className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-foreground font-medium hover:bg-[hsl(var(--surface-hover))]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
