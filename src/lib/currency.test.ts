import { describe, expect, it } from "vitest";
import { parseNumberLoose } from "./currency";

describe("parseNumberLoose", () => {
  it.each([
    ["2.500,00", 2500],
    ["R$ 1.234,56", 1234.56],
    ["35,5", 35.5],
    ["1,234.56", 1234.56],
    ["12.50", 12.5],
    ["1.234", 1234],
    ["1.234.567", 1234567],
    ["0.123", 0.123],
    ["3550", 3550],
    ["-500,00", -500],
    ["R$ -500,00", -500],
    ["(500,00)", -500],
  ])("%s → %d", (input, expected) => {
    expect(parseNumberLoose(input)).toBeCloseTo(expected, 8);
  });

  it("devolve null sem dígitos", () => {
    expect(parseNumberLoose("")).toBeNull();
    expect(parseNumberLoose("R$")).toBeNull();
    expect(parseNumberLoose(undefined)).toBeNull();
  });
});
