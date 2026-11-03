/**
 * Datas do ponto de vista do usuário, não do servidor.
 *
 * O servidor costuma rodar em UTC (Docker, VPS, hospedagens Node): depois das 21h no
 * Brasil, `new Date().getDate()` já é o dia seguinte, e no último dia do mês o
 * "mês atual" vira antes da hora. Tudo que decide "hoje" ou "mês atual" no
 * servidor passa por aqui. Fuso configurável por APP_TIMEZONE.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Sao_Paulo";

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export function todayParts(now: Date = new Date(), timeZone: string = APP_TIMEZONE): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function currentYearMonth(now: Date = new Date()): { year: number; month: number } {
  const { year, month } = todayParts(now);
  return { year, month };
}

/** "Hoje" para colunas @db.Date: meia-noite UTC do dia local, que o Prisma grava sem deslocar. */
export function todayDateOnly(now: Date = new Date()): Date {
  const { year, month, day } = todayParts(now);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Data de arquivo importado: aceita dd/mm/aaaa, dd-mm-aaaa e aaaa-mm-dd.
 * Devolve "aaaa-mm-dd", ou "" se não houver data válida.
 */
export function parseImportDate(value: string | null | undefined): string {
  if (!value) return "";
  const s = value.trim();
  let y: number, m: number, d: number;
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  const iso = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (br) {
    [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
  } else if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    return "";
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
