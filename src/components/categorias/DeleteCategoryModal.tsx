"use client";

import { useState } from "react";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface DeleteCategoryModalProps {
  category: Category;
  targetCategories: Category[];
  transactionCount: number;
  vaultCount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteCategoryModal({
  category,
  targetCategories,
  transactionCount,
  vaultCount,
  onClose,
  onSuccess,
}: DeleteCategoryModalProps) {
  const [reassignToId, setReassignToId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    if (!reassignToId) {
      setError("Selecione a categoria de destino.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignToCategoryId: reassignToId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erro ao excluir");
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
          Excluir categoria
        </h2>
        <p className="text-muted-foreground text-sm mb-4">
          A categoria <strong>{category.name}</strong> possui {transactionCount}{" "}
          lançamento(s) e {vaultCount} cofre(s). Para excluir, escolha para qual
          categoria os dados serão transferidos:
        </p>
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}
        <div className="mb-4">
          <label className="block label-style mb-2">
            Categoria de destino
          </label>
          {targetCategories.length === 0 ? (
            <p className="text-sm text-destructive">
              Não há outras categorias. Crie uma categoria antes de excluir.
            </p>
          ) : (
            <select
              value={reassignToId}
              onChange={(e) => setReassignToId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              <option value="">Selecione...</option>
              {targetCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || !reassignToId || targetCategories.length === 0}
            className="flex-1 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Excluindo..." : "Excluir"}
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
