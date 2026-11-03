"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ASSET_TYPE_LABELS,
  INVESTMENT_ASSET_TYPES_ORDERED,
} from "@/lib/investment-asset-types";
import { getDefaultDistributionGroupsPayload } from "@/lib/distribution-groups-defaults";
import type { InvestmentAssetType } from "@/db/enums";

interface DistGroup {
  id: string;
  name: string;
  sortOrder: number;
  assetTypes: string[];
}

export function DistributionGroupsModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [groups, setGroups] = useState<DistGroup[]>([]);
  const [assetToGroupId, setAssetToGroupId] = useState<
    Record<InvestmentAssetType, string>
  >({} as Record<InvestmentAssetType, string>);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyFromApi = useCallback((list: DistGroup[]) => {
    setGroups(list);
    const map = {} as Record<InvestmentAssetType, string>;
    for (const g of list) {
      for (const at of g.assetTypes) {
        map[at as InvestmentAssetType] = g.id;
      }
    }
    setAssetToGroupId(map);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/settings/distribution-groups")
      .then((r) => {
        if (!r.ok) throw new Error("fetch");
        return r.json();
      })
      .then((data: { groups?: DistGroup[] }) => {
        if (cancelled) return;
        if (data.groups && data.groups.length > 0) {
          applyFromApi(data.groups);
        } else {
          const def = getDefaultDistributionGroupsPayload();
          const synthetic: DistGroup[] = def.groups.map((g, i) => ({
            id: `seed-${i}`,
            name: g.name,
            sortOrder: g.sortOrder,
            assetTypes: [...g.assetTypes],
          }));
          applyFromApi(synthetic);
        }
      })
      .catch(() => {
        toast.error("Erro ao carregar grupos");
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFromApi, onClose]);

  const buildPayload = () => {
    const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      groups: sorted
        .map((g) => ({
          name: g.name.trim(),
          sortOrder: g.sortOrder,
          assetTypes: INVESTMENT_ASSET_TYPES_ORDERED.filter(
            (at) => assetToGroupId[at] === g.id
          ),
        }))
        .filter((g) => g.assetTypes.length > 0),
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = buildPayload();
      const res = await fetch("/api/settings/distribution-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Erro ao salvar"
        );
        return;
      }
      if (data.groups) applyFromApi(data.groups);
      toast.success("Grupos de distribuição salvos");
      onSuccess?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    const def = getDefaultDistributionGroupsPayload();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/distribution-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Erro ao restaurar"
        );
        return;
      }
      if (data.groups) applyFromApi(data.groups);
      toast.success("Padrão restaurado (Internacional = BTC + USDC)");
      onSuccess?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const addGroup = () => {
    const id = crypto.randomUUID();
    const sortOrder =
      groups.length > 0
        ? Math.max(...groups.map((g) => g.sortOrder)) + 1
        : 0;
    setGroups((prev) => [...prev, { id, name: "Novo grupo", sortOrder, assetTypes: [] }]);
  };

  const removeGroup = (id: string) => {
    if (groups.length <= 1) {
      toast.error("É necessário manter pelo menos um grupo");
      return;
    }
    const fallback = groups.find((g) => g.id !== id);
    if (!fallback) {
      toast.error("É necessário manter pelo menos um grupo");
      return;
    }
    setAssetToGroupId((prev) => {
      const next = { ...prev };
      for (const at of INVESTMENT_ASSET_TYPES_ORDERED) {
        if (next[at] === id) next[at] = fallback.id;
      }
      return next;
    });
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const updateGroupName = (id: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name } : g))
    );
  };

  const updateGroupSort = (id: string, sortOrder: number) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, sortOrder } : g))
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card-surface w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Distribuição do portfólio
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Defina grupos para a aba Distribuição (gráfico e tabela). Cada tipo de
          produto entra em um único grupo — por exemplo, Bitcoin e USDC no grupo
          &quot;Internacional&quot;.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Carregando...
          </p>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Grupos
              </p>
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap gap-2 items-end border border-border rounded-lg p-3"
                >
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground">Nome</label>
                    <input
                      type="text"
                      value={g.name}
                      onChange={(e) => updateGroupName(g.id, e.target.value)}
                      className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm"
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-muted-foreground">Ordem</label>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={g.sortOrder}
                      onChange={(e) =>
                        updateGroupSort(g.id, parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(g.id)}
                    className="text-xs text-destructive hover:underline px-1"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addGroup}
                className="text-sm text-primary hover:underline"
              >
                + Novo grupo
              </button>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Produto (tipo) → grupo
              </p>
              <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {INVESTMENT_ASSET_TYPES_ORDERED.map((at) => (
                  <div
                    key={at}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="text-foreground">
                      {ASSET_TYPE_LABELS[at]}
                    </span>
                    <select
                      value={assetToGroupId[at] ?? ""}
                      onChange={(e) => {
                        const gid = e.target.value;
                        setAssetToGroupId((prev) => ({
                          ...prev,
                          [at]: gid,
                        }));
                      }}
                      className="max-w-[200px] px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={handleRestoreDefaults}
                disabled={saving}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Restaurar padrão
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-[hsl(var(--surface-hover))]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
