"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/lib/auth-client";

const input = "w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground";

/** Troca a senha; opcionalmente encerra a sessão nos outros dispositivos. */
export function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError("A nova senha precisa de 8 caracteres ou mais.");
    if (next !== confirm) return setError("As senhas novas não conferem.");
    setSaving(true);
    try {
      const { error: authError } = await changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: revokeOthers,
      });
      if (authError) {
        return setError(authError.status === 429 ? "Muitas tentativas. Aguarde um minuto." : "Senha atual incorreta.");
      }
      toast.success(revokeOthers ? "Senha alterada. Outros dispositivos foram desconectados." : "Senha alterada.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-surface p-4 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-4 text-left w-full text-foreground bg-transparent border-0 cursor-pointer"
      >
        <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <KeyRound className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-medium">Alterar senha</h2>
          <p className="text-sm text-muted-foreground">Troque a senha de acesso e, se quiser, saia dos outros dispositivos</p>
        </div>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input type="password" placeholder="Senha atual" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} required autoComplete="current-password" />
          <input type="password" placeholder="Nova senha (mín. 8)" value={next} onChange={(e) => setNext(e.target.value)} className={input} required autoComplete="new-password" />
          <input type="password" placeholder="Confirme a nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required autoComplete="new-password" />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={revokeOthers} onChange={(e) => setRevokeOthers(e.target.checked)} />
            Sair de todos os outros dispositivos
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      )}
    </div>
  );
}
