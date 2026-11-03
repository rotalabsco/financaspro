import { describe, expect, it } from "vitest";
import { parseImportDate, todayDateOnly, todayParts } from "./dates";

describe("parseImportDate", () => {
  it("lê formato brasileiro", () => {
    expect(parseImportDate("15/01/2025")).toBe("2025-01-15");
    expect(parseImportDate("5-3-2025")).toBe("2025-03-05");
  });
  it("lê ISO (antes virava 2025-01-2025-01-15)", () => {
    expect(parseImportDate("2025-01-15")).toBe("2025-01-15");
  });
  it("recusa data inexistente ou vazia", () => {
    expect(parseImportDate("31/02/2025")).toBe("");
    expect(parseImportDate("abc")).toBe("");
    expect(parseImportDate(undefined)).toBe("");
  });
});

describe("hoje no fuso do app", () => {
  // 31/10/2026 22:30 em São Paulo = 01/11/2026 01:30 UTC
  const lateNight = new Date("2026-11-01T01:30:00Z");
  it("não pula para o dia/mês seguinte à noite", () => {
    expect(todayParts(lateNight, "America/Sao_Paulo")).toEqual({ year: 2026, month: 10, day: 31 });
  });
  it("grava @db.Date com o dia local", () => {
    expect(todayDateOnly(lateNight).toISOString().slice(0, 10)).toBe("2026-10-31");
  });
});
