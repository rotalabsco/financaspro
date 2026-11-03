"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  color: string;
  isReceita?: boolean;
}

interface ForecastCategory {
  id: string;
  categoryId: string;
  category: Category;
}

export function ForecastCategoriesModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/categories?archived=true").then((r) => r.json()),
      fetch("/api/settings/forecast-categories").then((r) => r.json()),
    ])
      .then(([cats, configs]: [Category[] | { error: string }, ForecastCategory[] | { error: string }]) => {
        const list = Array.isArray(cats) ? cats : [];
        const configList = Array.isArray(configs) ? configs : [];
        setCategories(list.filter((c) => !c.isReceita));
        setSelectedIds(new Set(configList.map((c) => c.categoryId)));
      })
      .catch(() => {
        toast.error("Erro ao carregar categorias");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [onClose]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = JSON.stringify({ categoryIds: Array.from(selectedIds) });
      let res = await fetch("/api/settings/forecast-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      // Compatibilidade: alguns ambientes podem bloquear PUT nessa rota.
      if (res.status === 405) {
        res = await fetch("/api/settings/forecast-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erro ao salvar");
        return;
      }
      toast.success("Categorias de previsão atualizadas");
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
        className="card-surface w-full max-w-md p-6 mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Categorias para Previsão de Despesas
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Selecione as categorias que serão usadas para calcular a média dos últimos 3 meses na previsão de meses futuros.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 mb-4">
            {categories.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-[hsl(var(--surface-hover))] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="rounded border-border"
                />
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-sm text-foreground">{c.name}</span>
              </label>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">Nenhuma categoria de despesa encontrada.</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border shrink-0">
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
