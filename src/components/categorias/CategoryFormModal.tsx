"use client";

import { useState, useEffect } from "react";
import { parseNumberLoose } from "@/lib/currency";

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  defaultType: string;
  monthlyGoal: number | null;
}

interface CategoryFormModalProps {
  category?: Category | null;
  onClose: () => void;
  onSuccess: () => void;
}

const COLORS = [
  "#6B7280", "#EF4444", "#F97316", "#EAB308", "#22C55E", "#14B8A6",
  "#3B82F6", "#8B5CF6", "#EC4899",
];

const DEFAULT_TYPES = [
  { value: "VARIAVEL", label: "Variável" },
  { value: "FIXO", label: "Fixo" },
  { value: "RECORRENTE", label: "Recorrente" },
  { value: "COFRE", label: "Cofre" },
];

export function CategoryFormModal({
  category,
  onClose,
  onSuccess,
}: CategoryFormModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [defaultType, setDefaultType] = useState("VARIAVEL");
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!category;

  useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color);
      setDefaultType(category.defaultType);
      setMonthlyGoal(
        category.monthlyGoal != null ? String(category.monthlyGoal) : ""
      );
    }
  }, [category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }

    const goal = monthlyGoal ? parseNumberLoose(monthlyGoal) : null;
    if (goal != null && (isNaN(goal) || goal < 0)) {
      setError("Meta mensal inválida.");
      return;
    }

    setSubmitting(true);
    try {
      const url = isEdit
        ? `/api/categories/${category!.id}`
        : "/api/categories";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        name: name.trim(),
        color,
        defaultType,
        monthlyGoal: goal,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao salvar");
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
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
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {isEdit ? "Editar Categoria" : "Nova Categoria"}
        </h2>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block label-style mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="Ex: Mercado, Transporte"
              required
            />
          </div>

          <div>
            <label className="block label-style mb-1">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block label-style mb-1">Tipo padrão</label>
            <select
              value={defaultType}
              onChange={(e) => setDefaultType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              {DEFAULT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block label-style mb-1">Meta mensal (R$) — opcional</label>
            <input
              type="text"
              value={monthlyGoal}
              onChange={(e) => setMonthlyGoal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-foreground font-medium hover:bg-[hsl(var(--surface-hover))]"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
