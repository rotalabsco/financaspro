"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { parseNumberLoose } from "@/lib/currency";

interface CreditCard {
  id: string;
  name: string;
  institution?: string | null;
  closingDay: number | null;
  dueDay: number | null;
  creditLimit: number | null;
  isActive: boolean;
  sortOrder: number;
}

function CreditCardFormModal({
  card,
  onClose,
  onSuccess,
}: {
  card: CreditCard | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [institution, setInstitution] = useState(card?.institution ?? "");
  const [closingDay, setClosingDay] = useState(card?.closingDay != null ? String(card.closingDay) : "");
  const [dueDay, setDueDay] = useState(card?.dueDay != null ? String(card.dueDay) : "");
  const [creditLimit, setCreditLimit] = useState(card?.creditLimit != null ? String(card.creditLimit) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (card) {
      setName(card.name);
      setInstitution(card.institution ?? "");
      setClosingDay(card.closingDay != null ? String(card.closingDay) : "");
      setDueDay(card.dueDay != null ? String(card.dueDay) : "");
      setCreditLimit(card.creditLimit != null ? String(card.creditLimit) : "");
    }
  }, [card]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        institution: institution.trim() || null,
        closingDay: closingDay ? Math.min(31, Math.max(1, parseInt(closingDay, 10))) : null,
        dueDay: dueDay ? Math.min(31, Math.max(1, parseInt(dueDay, 10))) : null,
        creditLimit: creditLimit ? parseNumberLoose(creditLimit) : null,
      };
      const url = card ? `/api/credit-cards/${card.id}` : "/api/credit-cards";
      const res = await fetch(url, {
        method: card ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          {card ? "Editar Cartão" : "Novo Cartão de Crédito"}
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
              placeholder="Ex: Nubank, Itaú Visa"
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block label-style mb-1">Dia fechamento (1-31)</label>
              <input
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                placeholder="Ex: 10"
              />
            </div>
            <div>
              <label className="block label-style mb-1">Dia vencimento (1-31)</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
                placeholder="Ex: 15"
              />
            </div>
          </div>
          <div>
            <label className="block label-style mb-1">Limite (opcional)</label>
            <input
              type="text"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono-nums"
              placeholder="0,00"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Salvando..." : card ? "Salvar" : "Adicionar"}
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

export default function CartoesPage() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/credit-cards?inactive=true");
    if (!res.ok) return [];
    return res.json() as Promise<CreditCard[]>;
  }, []);

  useEffect(() => {
    fetchCards().then((data) => {
      setCards(data);
      setLoading(false);
    });
  }, [fetchCards]);

  const handleSuccess = useCallback(async () => {
    const data = await fetchCards();
    setCards(data);
    setShowAddModal(false);
    setEditingCard(null);
  }, [fetchCards]);

  const handleDelete = async (card: CreditCard) => {
    if (!window.confirm(`Excluir "${card.name}"? Não será possível se houver lançamentos vinculados.`)) return;
    const res = await fetch(`/api/credit-cards/${card.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erro ao excluir");
      return;
    }
    const list = await fetchCards();
    setCards(list);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">
          Cartões de Crédito
        </h1>
        <div className="flex items-center gap-2">
        <Link
          href="/dashboard/cartoes/projecao"
          className="px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-[hsl(var(--surface-hover))]"
        >
          Ver projeção
        </Link>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          + Novo Cartão
        </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Cartões usados para registrar despesas parceladas ou à vista no crédito.
      </p>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {cards.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground">
            Nenhum cartão cadastrado. Crie o primeiro para usar em lançamentos de despesa.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground bg-[hsl(var(--surface))] border-b border-border">
                <th className="py-3 px-4 font-medium">Nome</th>
                <th className="py-3 px-4 font-medium">Instituição</th>
                <th className="py-3 px-4 font-medium">Fechamento</th>
                <th className="py-3 px-4 font-medium">Vencimento</th>
                <th className="py-3 px-4 font-medium">Limite</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border/50 hover:bg-[hsl(var(--surface-hover))] ${
                    !c.isActive ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-foreground">{c.name}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.institution ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.closingDay ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.dueDay ?? "—"}</td>
                  <td className="py-3 px-4 font-mono-nums text-muted-foreground">
                    {c.creditLimit != null ? formatCurrency(c.creditLimit) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        c.isActive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                      }`}
                    >
                      {c.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingCard(c)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-hover))]"
                        title="Editar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
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

      {(showAddModal || editingCard) && (
        <CreditCardFormModal
          card={editingCard}
          onClose={() => {
            setShowAddModal(false);
            setEditingCard(null);
          }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
