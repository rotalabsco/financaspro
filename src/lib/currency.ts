/**
 * Parse valor monetário em formato BR.
 * - "3550" → 3550 (reais inteiros)
 * - "35,50" → 35.50 (vírgula decimal)
 * - "3.550,50" → 3550.50 (ponto milhar, vírgula decimal)
 */
export function parseCurrencyBR(value: string): number {
  return parseDecimalBR(value, 2);
}

/**
 * Parse decimal em formato BR com casas decimais configuráveis.
 * Para USDC/crypto: parseDecimalBR("0,002658", 8) → 0.002658
 */
export function parseDecimalBR(value: string, maxDecimals = 2): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.includes(",")) {
    const [intPart, decPart] = trimmed.split(",");
    const int = (intPart ?? "0").replace(/\D/g, "");
    const dec = (decPart ?? "0").replace(/\D/g, "").slice(0, maxDecimals);
    return parseFloat(`${int}.${dec || "0"}`) || 0;
  }
  if (trimmed.includes(".")) {
    const [intPart, decPart] = trimmed.split(".");
    const int = (intPart ?? "0").replace(/\D/g, "");
    const dec = (decPart ?? "0").replace(/\D/g, "").slice(0, maxDecimals);
    return parseFloat(`${int}.${dec || "0"}`) || 0;
  }
  const digits = trimmed.replace(/\D/g, "");
  return parseFloat(digits) || 0;
}

/**
 * Lê um número vindo de arquivo importado ou de texto livre, em formato BR ou US.
 * - "2.500,00" → 2500 · "1,234.56" → 1234.56 · "35,5" → 35.5
 * - "1.234" → 1234 (ponto com 3 dígitos depois = milhar) · "12.50" → 12.5
 * - Sinal preservado: "-500,00", "R$ -500,00" e "(500,00)" → -500
 * Devolve null quando não há dígitos.
 */
export function parseNumberLoose(value: string | null | undefined): number | null {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^[^\d]*-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // O separador que aparece por último é o decimal.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    normalized =
      parts.length > 2 ? parts.join("") : `${parts[0]}.${parts[1]}`;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    const isThousands = parts.length > 2 || (parts[1].length === 3 && parts[0] !== "" && parts[0] !== "0");
    normalized = isThousands ? parts.join("") : s;
  } else {
    normalized = s;
  }
  const n = parseFloat(normalized);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}
