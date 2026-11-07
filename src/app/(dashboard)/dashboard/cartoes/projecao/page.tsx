"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, ChevronDown, ChevronRight, CreditCard, Layers, TrendingDown } from "lucide-react";
import { KPICard } from "@/components/ui/KPICard";

interface Encerrando {
  description: string;
  valor: number;
  parcelas: number;
  cartao?: string;
}

interface MesCartao {
  mes: string;
  total: number;
  parcelas: number;
  recorrentes: number;
  aVista: number;
  qtdParcelamentos: number;
  encerrando: Encerrando[];
  valorEncerrando: number;
  liberado: number;
  liberadoAcumulado: number;
}

interface Parcelamento {
  description: string;
  categoria: string | null;
  valorParcela: number;
  parcelaAtual: number | null;
  totalParcelas: number | null;
  restantes: number;
  valorRestante: number;
  ultimoMes: string;
  cartao?: string;
}

interface CartaoProjecao {
  id: string;
  name: string;
  institution: string | null;
  closingDay: number | null;
  dueDay: number | null;
  creditLimit: number | null;
  isActive: boolean;
  meses: MesCartao[];
  parcelamentos: Parcelamento[];
}

interface Projecao {
  inicio: string;
  meses: string[];
  cartoes: CartaoProjecao[];
}

const TODOS = "__todos__";

// Paleta categórica validada (dataviz) contra a superfície escura do app (#141f38).
const SERIES = [
  { key: "parcelas", label: "Parcelas", color: "#3987e5" },
  { key: "recorrentes", label: "Recorrentes", color: "#d95926" },
  { key: "aVista", label: "À vista", color: "#199e70" },
] as const;

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function nomeMes(mes: string, comAno = true) {
  const [y, m] = mes.split("-").map(Number);
  return comAno ? `${MESES_CURTOS[m - 1]}/${String(y).slice(2)}` : MESES_CURTOS[m - 1];
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const brlCurto = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;

function consolidar(cartoes: CartaoProjecao[], meses: string[]): CartaoProjecao {
  const mesesOut: MesCartao[] = meses.map((mes, i) => {
    const doMes = cartoes.map((c) => c.meses[i]);
    return {
      mes,
      total: doMes.reduce((s, m) => s + m.total, 0),
      parcelas: doMes.reduce((s, m) => s + m.parcelas, 0),
      recorrentes: doMes.reduce((s, m) => s + m.recorrentes, 0),
      aVista: doMes.reduce((s, m) => s + m.aVista, 0),
      qtdParcelamentos: doMes.reduce((s, m) => s + m.qtdParcelamentos, 0),
      encerrando: cartoes
        .flatMap((c, ci) => doMes[ci].encerrando.map((e) => ({ ...e, cartao: c.name })))
        .sort((a, z) => z.valor - a.valor),
      valorEncerrando: doMes.reduce((s, m) => s + m.valorEncerrando, 0),
      liberado: doMes.reduce((s, m) => s + m.liberado, 0),
      liberadoAcumulado: doMes.reduce((s, m) => s + m.liberadoAcumulado, 0),
    };
  });
  return {
    id: TODOS,
    name: "Todos os cartões",
    institution: null,
    closingDay: null,
    dueDay: null,
    creditLimit: cartoes.every((c) => c.creditLimit != null)
      ? cartoes.reduce((s, c) => s + (c.creditLimit ?? 0), 0)
      : null,
    isActive: true,
    meses: mesesOut,
    parcelamentos: cartoes
      .flatMap((c) => c.parcelamentos.map((p) => ({ ...p, cartao: c.name })))
      .sort((a, z) => (a.ultimoMes === z.ultimoMes ? z.valorParcela - a.valorParcela : a.ultimoMes < z.ultimoMes ? -1 : 1)),
  };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: MesCartao }[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--surface))] px-3 py-2 text-xs shadow-lg min-w-[200px]">
      <p className="font-medium text-foreground mb-1.5">{nomeMes(m.mes)}</p>
      {SERIES.map((s) =>
        m[s.key] > 0 ? (
          <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-mono-nums text-foreground">{brl(m[s.key])}</span>
          </div>
        ) : null
      )}
      <div className="flex justify-between gap-4 border-t border-border mt-1.5 pt-1.5">
        <span className="text-muted-foreground">Fatura prevista</span>
        <span className="font-mono-nums font-medium text-foreground">{brl(m.total)}</span>
      </div>
      {m.liberado > 0 && (
        <div className="flex justify-between gap-4 pt-0.5">
          <span className="text-muted-foreground">Orçamento que abre</span>
          <span className="font-mono-nums text-success">+{brl(m.liberado)}</span>
        </div>
      )}
    </div>
  );
}

export default function ProjecaoCartoesPage() {
  const [data, setData] = useState<Projecao | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credit-cards/projecao")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro ao carregar");
        setData(j);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const opcoes = useMemo(() => {
    if (!data) return [];
    const comDados = data.cartoes.filter((c) => c.meses.some((m) => m.total > 0) || c.parcelamentos.length > 0);
    const lista = comDados.length > 0 ? comDados : data.cartoes;
    return lista.length > 1 ? [consolidar(lista, data.meses), ...lista] : lista;
  }, [data]);

  const cartao = opcoes.find((c) => c.id === selecionado) ?? opcoes[0];

  if (error) {
    return <p className="p-4 text-destructive">{error}</p>;
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }
  if (!cartao) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold text-foreground mb-2">Projeção de Cartões</h1>
        <p className="text-muted-foreground">
          Nenhum cartão cadastrado. <Link href="/dashboard/cartoes" className="text-primary underline">Cadastre um cartão</Link>{" "}
          e vincule os lançamentos de crédito a ele.
        </p>
      </div>
    );
  }

  const meses = cartao.meses;
  const atual = meses[0];
  const proximo = meses[1];
  const ultimoComParcela = [...meses].reverse().find((m) => m.parcelas > 0);
  const saldoParcelado = cartao.parcelamentos.reduce((s, p) => s + p.valorRestante, 0);
  const abreAteFim = meses[meses.length - 1]?.liberadoAcumulado ?? 0;
  const temRecorrenteQueSome = meses.some((m, i) => i > 0 && meses[i - 1].recorrentes > 0 && m.recorrentes === 0);

  return (
    <div className="md:p-4 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projeção de Cartões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quanto da fatura já está comprometido em cada mês, quais parcelas terminam e quanto orçamento isso abre.
          </p>
        </div>
        <Link
          href="/dashboard/cartoes"
          className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-[hsl(var(--surface-hover))]"
        >
          Gerenciar cartões
        </Link>
      </div>

      {opcoes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist">
          {opcoes.map((c) => {
            const ativo = c.id === cartao.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => {
                  setSelecionado(c.id);
                  setAberto(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  ativo
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-hover))]"
                }`}
              >
                {c.name}
                {!c.isActive && " (inativo)"}
              </button>
            );
          })}
        </div>
      )}

      {cartao.id !== TODOS && (cartao.closingDay || cartao.dueDay || cartao.creditLimit) && (
        <p className="text-xs text-muted-foreground -mt-3">
          {[
            cartao.closingDay ? `Fecha dia ${cartao.closingDay}` : null,
            cartao.dueDay ? `vence dia ${cartao.dueDay}` : null,
            cartao.creditLimit ? `limite ${brl(cartao.creditLimit)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          index={0}
          icon={CreditCard}
          label={`Fatura de ${nomeMes(atual.mes)}`}
          value={brl(atual.total)}
          change={
            cartao.creditLimit
              ? `${Math.round((atual.total / cartao.creditLimit) * 100)}% do limite`
              : `${atual.qtdParcelamentos} parcelamentos no mês`
          }
        />
        <KPICard
          index={1}
          icon={CalendarClock}
          label={proximo ? `Já comprometido em ${nomeMes(proximo.mes)}` : "Próximo mês"}
          value={proximo ? brl(proximo.total) : "—"}
          change={proximo && proximo.liberado > 0 ? `abre ${brl(proximo.liberado)} vs. ${nomeMes(atual.mes)}` : undefined}
          changeType="positive"
        />
        <KPICard
          index={2}
          icon={TrendingDown}
          label={`Orçamento que abre até ${nomeMes(meses[meses.length - 1].mes)}`}
          value={brl(abreAteFim)}
          change={ultimoComParcela ? `última parcela em ${nomeMes(ultimoComParcela.mes)}` : "sem parcelas futuras"}
          changeType="positive"
        />
        <KPICard
          index={3}
          icon={Layers}
          label="Saldo a pagar em parcelas"
          value={brl(saldoParcelado)}
          change={`${cartao.parcelamentos.length} parcelamentos em aberto`}
        />
      </div>

      <section className="card-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold text-foreground">Fatura prevista por mês</h2>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={meses} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis
                dataKey="mes"
                tickFormatter={(m: string) => nomeMes(m)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={brlCurto}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--surface-hover))", opacity: 0.6 }} />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="fatura"
                  fill={s.color}
                  stroke="hsl(var(--surface))"
                  strokeWidth={2}
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {temRecorrenteQueSome && (
          <p className="text-xs text-muted-foreground mt-2">
            A abertura de orçamento conta só parcelas que terminam. Recorrentes que somem ao longo do gráfico
            (série encerrada ou mês ainda não gerado) não entram nessa conta.
          </p>
        )}
      </section>

      <section className="card-surface overflow-hidden">
        <div className="p-4 pb-2">
          <h2 className="text-base font-semibold text-foreground">Mês a mês</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique num mês para ver as parcelas que terminam nele. O valor delas abre no orçamento do mês seguinte.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2.5 px-4 font-medium">Mês</th>
                <th className="py-2.5 px-4 font-medium text-right">Fatura prevista</th>
                <th className="py-2.5 px-4 font-medium text-right">Parcelas</th>
                <th className="py-2.5 px-4 font-medium text-right">Recorrentes</th>
                <th className="py-2.5 px-4 font-medium text-right">À vista</th>
                <th className="py-2.5 px-4 font-medium text-right">Terminam no mês</th>
                <th className="py-2.5 px-4 font-medium text-right">Abre no mês</th>
                <th className="py-2.5 px-4 font-medium text-right">Abertura acumulada</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => {
                const expandido = aberto === m.mes;
                const podeAbrir = m.encerrando.length > 0;
                return (
                  <Fragment key={m.mes}>
                    <tr
                      className={`border-b border-border/50 ${podeAbrir ? "cursor-pointer hover:bg-[hsl(var(--surface-hover))]" : ""}`}
                      onClick={() => podeAbrir && setAberto(expandido ? null : m.mes)}
                    >
                      <td className="py-2.5 px-4 text-foreground font-medium">
                        <span className="inline-flex items-center gap-1">
                          {podeAbrir ? (
                            expandido ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <span className="w-4" />
                          )}
                          {nomeMes(m.mes)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-foreground">{brl(m.total)}</td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-muted-foreground">{brl(m.parcelas)}</td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-muted-foreground">{brl(m.recorrentes)}</td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-muted-foreground">{brl(m.aVista)}</td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-muted-foreground">
                        {m.encerrando.length > 0 ? (
                          <>
                            {brl(m.valorEncerrando)}{" "}
                            <span className="text-xs">({m.encerrando.length})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono-nums ${m.liberado > 0 ? "text-success" : "text-muted-foreground"}`}>
                        {m.liberado > 0 ? `+${brl(m.liberado)}` : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-foreground">
                        {m.liberadoAcumulado > 0 ? brl(m.liberadoAcumulado) : "—"}
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="border-b border-border/50 bg-[hsl(var(--background))]">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-xs text-muted-foreground mb-2">
                            Última parcela em {nomeMes(m.mes)} — abre {brl(m.valorEncerrando)} a partir do mês seguinte
                          </p>
                          <ul className="grid gap-1 sm:grid-cols-2">
                            {m.encerrando.map((e, i) => (
                              <li key={i} className="flex justify-between gap-3 text-sm">
                                <span className="text-foreground truncate">
                                  {e.description}
                                  <span className="text-muted-foreground text-xs ml-1.5">
                                    {e.parcelas}x{e.cartao ? ` · ${e.cartao}` : ""}
                                  </span>
                                </span>
                                <span className="font-mono-nums text-muted-foreground shrink-0">{brl(e.valor)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-surface overflow-hidden">
        <div className="p-4 pb-2">
          <h2 className="text-base font-semibold text-foreground">Parcelamentos em aberto</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Ordenados pelo mês da última parcela.</p>
        </div>
        {cartao.parcelamentos.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground">Nenhuma parcela a partir deste mês.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Descrição</th>
                  <th className="py-2.5 px-4 font-medium">Progresso</th>
                  <th className="py-2.5 px-4 font-medium text-right">Parcela</th>
                  <th className="py-2.5 px-4 font-medium text-right">Faltam</th>
                  <th className="py-2.5 px-4 font-medium text-right">Saldo</th>
                  <th className="py-2.5 px-4 font-medium text-right">Termina em</th>
                </tr>
              </thead>
              <tbody>
                {cartao.parcelamentos.map((p, i) => {
                  const total = p.totalParcelas ?? 0;
                  const pagas = p.parcelaAtual != null ? p.parcelaAtual - 1 : 0;
                  const pct = total > 0 ? Math.min(100, (pagas / total) * 100) : 0;
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2.5 px-4">
                        <p className="text-foreground">{p.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {[p.categoria, p.cartao].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-[hsl(var(--surface-hover))] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SERIES[0].color }} />
                          </div>
                          <span className="text-xs text-muted-foreground font-mono-nums">
                            {p.parcelaAtual ?? "?"}/{total || "?"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-foreground">{brl(p.valorParcela)}</td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-muted-foreground">{p.restantes}x</td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-foreground">{brl(p.valorRestante)}</td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">{nomeMes(p.ultimoMes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
