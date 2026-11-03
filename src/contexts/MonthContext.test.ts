import { describe, expect, it } from "vitest";
import { computeDefaultMonthIndex, type MonthListItem } from "./MonthContext";

// A lista vem da API do mais recente para o mais antigo.
const list = (items: Array<[number, number, string?, number?]>): MonthListItem[] =>
  items.map(([year, month, status = "RASCUNHO", reconciledCount = 0], i) => ({
    id: `m${i}`,
    year,
    month,
    status,
    reconciledCount,
  }));

const NOV_2026 = new Date(2026, 10, 3);

describe("computeDefaultMonthIndex", () => {
  it("abre no mês seguinte ao último fechado", () => {
    const months = list([[2027, 5], [2026, 12], [2026, 11], [2026, 10, "FECHADO"]]);
    expect(months[computeDefaultMonthIndex(months, NOV_2026)]).toMatchObject({ year: 2026, month: 11 });
  });

  it("sem mês fechado, prefere o aberto mais recente com conciliação", () => {
    const months = list([[2027, 5], [2026, 12], [2026, 11], [2026, 10, "RASCUNHO", 4]]);
    expect(months[computeDefaultMonthIndex(months, NOV_2026)]).toMatchObject({ year: 2026, month: 10 });
  });

  it("quem começou agora (parcelas criaram meses futuros) abre no mês atual", () => {
    const months = list([[2027, 5], [2027, 1], [2026, 12], [2026, 11], [2026, 10]]);
    expect(months[computeDefaultMonthIndex(months, NOV_2026)]).toMatchObject({ year: 2026, month: 11 });
  });

  it("sem o mês atual na lista, abre no aberto mais recente", () => {
    const months = list([[2026, 9], [2026, 8]]);
    expect(months[computeDefaultMonthIndex(months, NOV_2026)]).toMatchObject({ year: 2026, month: 9 });
  });

  it("lista vazia", () => {
    expect(computeDefaultMonthIndex([], NOV_2026)).toBe(0);
  });
});
