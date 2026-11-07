"use client";

import { useEffect, useState, useCallback } from "react";

interface BankAccount {
  id: string;
  name: string;
  institution?: string | null;
  isActive: boolean;
  sortOrder: number;
}

function BankAccountFormModal({
  account,
  onClose,
  onSuccess,
}: {
  account: BankAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setInstitution(account.institution ?? "");
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    setSubmitting(true);
    try {
      const url = account
        ? `/api/bank-accounts/${account.id}`
        : "/api/bank-accounts";
      const res = await fetch(url, {
        method: account ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          institution: institution.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
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
          {account ? "Editar Conta" : "Nova Conta Bancária"}
        </h2>
        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block label-style mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="Ex: Conta Corrente Principal"
              required
            />
          </div>
          <div>
            <label className="block label-style mb-1">Instituição (opcional)</label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="Ex: Nubank, Itaú"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Salvando..." : account ? "Salvar" : "Adicionar"}
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

interface BankAccount {
  id: string;
  name: string;
  institution?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export default function ContasPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/bank-accounts?inactive=true");
    if (!res.ok) return [];
    return res.json() as Promise<BankAccount[]>;
  }, []);

  useEffect(() => {
    fetchAccounts().then((data) => {
      setAccounts(data);
      setLoading(false);
    });
  }, [fetchAccounts]);

  const handleSuccess = useCallback(async () => {
    const data = await fetchAccounts();
    setAccounts(data);
    setShowAddModal(false);
    setEditingAccount(null);
  }, [fetchAccounts]);

  const handleDelete = async (account: BankAccount) => {
    if (!window.confirm(`Excluir "${account.name}"? Não será possível se houver lançamentos vinculados.`)) return;
    const res = await fetch(`/api/bank-accounts/${account.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erro ao excluir");
      return;
    }
    const list = await fetchAccounts();
    setAccounts(list);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-foreground">
          Contas Bancárias
        </h1>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          + Nova Conta
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Contas usadas para registrar em qual conta a receita foi creditada.
      </p>

      <div className="rounded-xl border border-border overflow-x-auto bg-card">
        {accounts.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground">
            Nenhuma conta cadastrada. Crie a primeira para usar em lançamentos de receita.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground bg-[hsl(var(--surface))] border-b border-border">
                <th className="py-3 px-4 font-medium">Nome</th>
                <th className="py-3 px-4 font-medium">Instituição</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-border/50 hover:bg-[hsl(var(--surface-hover))] ${
                    !a.isActive ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-foreground">{a.name}</td>
                  <td className="py-3 px-4 text-muted-foreground">{a.institution ?? "—"}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        a.isActive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                      }`}
                    >
                      {a.isActive ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingAccount(a)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-hover))]"
                        title="Editar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(a)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Excluir"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(showAddModal || editingAccount) && (
        <BankAccountFormModal
          account={editingAccount}
          onClose={() => {
            setShowAddModal(false);
            setEditingAccount(null);
          }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
