"use client";

import { useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";

export default function AdminPage() {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const handleClearTransactions = async () => {
    if (confirmText !== "LIMPAR" || !password) {
      setError('Digite "LIMPAR" e a sua senha atual para confirmar.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clear-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "LIMPAR", password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao limpar lançamentos");
        return;
      }
      setSuccess(data.deleted ?? 0);
      setConfirmText("");
      setPassword("");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-6">
        Área Admin
      </h1>

      <div className="card-surface p-6 max-w-md">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-destructive/10 text-destructive shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-foreground mb-1">
              Limpar todos os lançamentos
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Remove permanentemente todas as transações do sistema. Meses e
              categorias permanecem. Esta ação não pode ser desfeita e pede a sua
              senha atual.
            </p>

            <div className="space-y-3">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder='Digite LIMPAR para confirmar'
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono"
                disabled={loading}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Sua senha atual"
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleClearTransactions}
                disabled={confirmText !== "LIMPAR" || !password || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {loading ? "Limpando..." : "Limpar todos os lançamentos"}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}
            {success != null && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                {success} lançamento(s) removido(s).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
