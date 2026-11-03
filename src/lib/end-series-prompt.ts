/**
 * Pergunta a partir de qual mês (AAAA-MM) encerrar uma série recorrente.
 * Padrão: o mês seguinte ao atual. As séries já existem nos meses futuros,
 * então "depois do último lançamento" não serve mais como padrão.
 */
export function promptEndSeriesMonth(description: string): string | null {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const suggestion = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const answer = window.prompt(
    `Encerrar "${description}" a partir de qual mês (AAAA-MM)?\n\n` +
      "Esse mês e os seguintes são removidos; os anteriores ficam como estão.",
    suggestion
  );
  if (answer == null) return null;
  const value = answer.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    window.alert("Mês inválido. Use o formato AAAA-MM, por exemplo 2026-11.");
    return null;
  }
  return value;
}
