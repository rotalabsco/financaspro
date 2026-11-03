import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt, gte, inArray, isNotNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, creditCards, months, transactions as transactionsTable } from "@/db/schema";
import { addMonths } from "@/lib/months";
import { currentYearMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Projeção mês a mês da fatura de cada cartão: quanto já está comprometido
 * (parcelas, recorrentes, à vista), quais parcelamentos terminam em cada mês
 * e quanto de orçamento isso libera no mês seguinte.
 *
 * As parcelas já existem materializadas (uma linha por mês, ver POST de
 * /api/months/[id]/transactions), então aqui só agregamos por mês × cartão.
 * Parcelas antecipadas (isAntecipado) já foram pagas no mês da antecipação e
 * ficam de fora, como no resto do app.
 */

const MAX_MESES = 36;
const SEM_CARTAO = "__sem_cartao__";

type MesKey = string; // YYYY-MM

function mesKey(year: number, month: number): MesKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function valorLiquido(t: { amountRealizado: unknown; amountPrevisto: unknown; amountReembolso: unknown }) {
  const val = t.amountRealizado != null ? Number(t.amountRealizado) : Number(t.amountPrevisto);
  const reemb = t.amountReembolso != null ? Number(t.amountReembolso) : 0;
  return val - reemb;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Encerrando {
  description: string;
  valor: number;
  parcelas: number;
}

interface MesCartao {
  mes: MesKey;
  total: number;
  parcelas: number;
  recorrentes: number;
  aVista: number;
  qtdParcelamentos: number;
  /** parcelamentos cuja última parcela cai neste mês */
  encerrando: Encerrando[];
  valorEncerrando: number;
  /** orçamento que abre neste mês por parcelamentos que terminaram no mês anterior */
  liberado: number;
  /** soma de `liberado` desde o primeiro mês da janela */
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
  ultimoMes: MesKey;
}

function mesVazio(mes: MesKey): MesCartao {
  return {
    mes,
    total: 0,
    parcelas: 0,
    recorrentes: 0,
    aVista: 0,
    qtdParcelamentos: 0,
    encerrando: [],
    valorEncerrando: 0,
    liberado: 0,
    liberadoAcumulado: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = currentYearMonth();
    const inicioParam = searchParams.get("inicio");
    let startYear = now.year;
    let startMonth = now.month;
    if (inicioParam && /^\d{4}-\d{2}$/.test(inicioParam)) {
      const [y, m] = inicioParam.split("-").map(Number);
      if (m >= 1 && m <= 12) {
        startYear = y;
        startMonth = m;
      }
    }
    // Um mês antes do início, para saber o que termina nele e libera o primeiro mês.
    const prev = addMonths(startYear, startMonth, -1);

    const transactions = await db.query.transactions.findMany({
      where: and(
        ne(transactionsTable.isAntecipado, true),
        or(eq(transactionsTable.source, "CARTAO_CREDITO"), isNotNull(transactionsTable.creditCardId)),
        inArray(
          transactionsTable.categoryId,
          db.select({ id: categories.id }).from(categories).where(eq(categories.isReceita, false))
        ),
        inArray(
          transactionsTable.monthId,
          db
            .select({ id: months.id })
            .from(months)
            .where(
              or(gt(months.year, prev.year), and(eq(months.year, prev.year), gte(months.month, prev.month)))
            )
        )
      ),
      columns: {
        description: true,
        type: true,
        creditCardId: true,
        parceladoGroupId: true,
        installmentCurrent: true,
        installmentTotal: true,
        amountPrevisto: true,
        amountRealizado: true,
        amountReembolso: true,
      },
      with: {
        month: { columns: { year: true, month: true } },
        category: { columns: { name: true } },
      },
    });

    const cards = await db.query.creditCards.findMany({
      orderBy: [asc(creditCards.sortOrder), asc(creditCards.name)],
    });

    // Janela: do início até o último mês com lançamento de cartão (mín. 6, máx. MAX_MESES).
    const inicioKey = mesKey(startYear, startMonth);
    let ultimoKey = inicioKey;
    for (const t of transactions) {
      const k = mesKey(t.month.year, t.month.month);
      if (k > ultimoKey) ultimoKey = k;
    }
    const meses: MesKey[] = [];
    for (let i = 0; i < MAX_MESES; i++) {
      const { year, month } = addMonths(startYear, startMonth, i);
      const k = mesKey(year, month);
      if (k > ultimoKey && i >= 6) break;
      meses.push(k);
    }
    const prevKey = mesKey(prev.year, prev.month);
    const fimKey = meses[meses.length - 1];

    // Agrupa por cartão e, dentro dele, por série de parcelamento.
    type Grupo = {
      description: string;
      categoria: string | null;
      valorParcela: number;
      porMes: Map<MesKey, { valor: number; atual: number | null; total: number | null }>;
    };
    const porCartao = new Map<string, { meses: Map<MesKey, MesCartao>; grupos: Map<string, Grupo> }>();
    const bucket = (cardKey: string) => {
      let b = porCartao.get(cardKey);
      if (!b) {
        b = { meses: new Map(meses.map((m) => [m, mesVazio(m)])), grupos: new Map() };
        porCartao.set(cardKey, b);
      }
      return b;
    };

    for (const t of transactions) {
      const k = mesKey(t.month.year, t.month.month);
      const cardKey = t.creditCardId ?? SEM_CARTAO;
      const b = bucket(cardKey);
      const valor = valorLiquido(t);

      // Série de parcelamento: só linhas com contador (a linha avulsa de antecipação não tem).
      const ehParcela = t.type === "PARCELADO" && t.installmentCurrent != null;
      if (ehParcela) {
        const gKey =
          t.parceladoGroupId ?? `${t.description}|${t.installmentTotal ?? 0}|${Number(t.amountPrevisto)}`;
        let g = b.grupos.get(gKey);
        if (!g) {
          g = { description: t.description, categoria: t.category?.name ?? null, valorParcela: valor, porMes: new Map() };
          b.grupos.set(gKey, g);
        }
        const atual = g.porMes.get(k);
        g.porMes.set(k, {
          valor: (atual?.valor ?? 0) + valor,
          atual: t.installmentCurrent,
          total: t.installmentTotal,
        });
      }

      if (k === prevKey || k > fimKey) continue;
      const mc = b.meses.get(k);
      if (!mc) continue;
      mc.total += valor;
      if (t.type === "PARCELADO") mc.parcelas += valor;
      else if (t.type === "RECORRENTE") mc.recorrentes += valor;
      else mc.aVista += valor;
    }

    const montar = (cardKey: string) => {
      const b = porCartao.get(cardKey)!;
      const parcelamentos: Parcelamento[] = [];
      const liberaEm = new Map<MesKey, number>();

      for (const g of Array.from(b.grupos.values())) {
        const mesesDoGrupo = Array.from(g.porMes.keys()).sort();
        const ultimo = mesesDoGrupo[mesesDoGrupo.length - 1];
        const ultimaLinha = g.porMes.get(ultimo)!;
        const valorUltimo = ultimaLinha.valor;

        // Termina dentro da janela (ou no mês anterior a ela): libera no mês seguinte.
        if (ultimo >= prevKey && ultimo < fimKey) {
          const [y, m] = ultimo.split("-").map(Number);
          const n = addMonths(y, m, 1);
          const prox = mesKey(n.year, n.month);
          liberaEm.set(prox, (liberaEm.get(prox) ?? 0) + valorUltimo);
        }
        const mcUltimo = b.meses.get(ultimo);
        if (mcUltimo) {
          mcUltimo.encerrando.push({
            description: g.description,
            valor: round2(valorUltimo),
            parcelas: ultimaLinha.total ?? mesesDoGrupo.length,
          });
          mcUltimo.valorEncerrando += valorUltimo;
        }
        for (const mk of mesesDoGrupo) {
          const mc = b.meses.get(mk);
          if (mc) mc.qtdParcelamentos += 1;
        }

        const restantesMeses = mesesDoGrupo.filter((mk) => mk >= inicioKey);
        if (restantesMeses.length > 0) {
          const primeira = g.porMes.get(restantesMeses[0])!;
          parcelamentos.push({
            description: g.description,
            categoria: g.categoria,
            valorParcela: round2(primeira.valor),
            parcelaAtual: primeira.atual,
            totalParcelas: primeira.total,
            restantes: restantesMeses.length,
            valorRestante: round2(restantesMeses.reduce((s, mk) => s + g.porMes.get(mk)!.valor, 0)),
            ultimoMes: ultimo,
          });
        }
      }

      let acumulado = 0;
      const mesesOut = meses.map((mk) => {
        const mc = b.meses.get(mk)!;
        mc.liberado = liberaEm.get(mk) ?? 0;
        acumulado += mc.liberado;
        mc.liberadoAcumulado = acumulado;
        mc.encerrando.sort((a, z) => z.valor - a.valor);
        return {
          ...mc,
          total: round2(mc.total),
          parcelas: round2(mc.parcelas),
          recorrentes: round2(mc.recorrentes),
          aVista: round2(mc.aVista),
          valorEncerrando: round2(mc.valorEncerrando),
          liberado: round2(mc.liberado),
          liberadoAcumulado: round2(mc.liberadoAcumulado),
        };
      });
      parcelamentos.sort((a, z) => (a.ultimoMes === z.ultimoMes ? z.valorParcela - a.valorParcela : a.ultimoMes < z.ultimoMes ? -1 : 1));
      return { meses: mesesOut, parcelamentos };
    };

    const cartoes = [
      ...cards
        .filter((c) => porCartao.has(c.id) || c.isActive)
        .map((c) => {
          if (!porCartao.has(c.id)) bucket(c.id);
          return {
            id: c.id,
            name: c.name,
            institution: c.institution,
            closingDay: c.closingDay,
            dueDay: c.dueDay,
            creditLimit: c.creditLimit != null ? Number(c.creditLimit) : null,
            isActive: c.isActive,
            ...montar(c.id),
          };
        }),
      ...(porCartao.has(SEM_CARTAO)
        ? [
            {
              id: SEM_CARTAO,
              name: "Cartão não informado",
              institution: null,
              closingDay: null,
              dueDay: null,
              creditLimit: null,
              isActive: true,
              ...montar(SEM_CARTAO),
            },
          ]
        : []),
    ];

    return NextResponse.json({ inicio: inicioKey, meses, cartoes });
  } catch (error) {
    console.error("GET /api/credit-cards/projecao:", error);
    return NextResponse.json({ error: "Falha ao montar a projeção dos cartões" }, { status: 500 });
  }
}
