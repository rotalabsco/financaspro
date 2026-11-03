"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const input =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export default function SetupPage() {
  const router = useRouter();
  const [needed, setNeeded] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setNeeded(Boolean(d.needed)))
      .catch(() => setNeeded(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("As senhas não conferem.");
    setSaving(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Não foi possível criar o usuário.");
      router.push("/login");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-gray-800 shadow-lg rounded-xl">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">Primeiro acesso</h1>
        {needed === null && <p className="text-sm text-center text-gray-500">Carregando...</p>}
        {needed === false && (
          <p className="text-sm text-center text-gray-600 dark:text-gray-300">
            O app já está configurado. <Link href="/login" className="text-indigo-600 underline">Entrar</Link>
          </p>
        )}
        {needed && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
              Crie o usuário que vai administrar esta instalação.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="name" className={label}>Nome</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={input} required />
              </div>
              <div>
                <label htmlFor="email" className={label}>E-mail</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} required />
              </div>
              <div>
                <label htmlFor="password" className={label}>Senha (mín. 8 caracteres)</label>
                <input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={input} required />
              </div>
              <div>
                <label htmlFor="confirm" className={label}>Confirme a senha</label>
                <input id="confirm" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg"
              >
                {saving ? "Criando..." : "Criar e ir para o login"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
