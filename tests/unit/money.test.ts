import { describe, expect, it } from "vitest";
import { decimalPlaces, lineGrossCents, parseDecimal, roundMoney, toCents } from "@/lib/domain/money";

describe("parseDecimal (entrada em formato brasileiro)", () => {
  it.each([
    ["10", 10],
    ["10,5", 10.5],
    ["10.5", 10.5],
    ["1.234,56", 1234.56],
    ["1.234.567", 1234567],
    ["1.234.567,89", 1234567.89],
    ["R$ 25,90", 25.9],
    ["  7,000 ", 7],
    ["0,005", 0.005],
    [",5", 0.5],
    ["-3,2", -3.2],
  ])("interpreta %s como %s", (input, expected) => {
    expect(parseDecimal(input)).toBeCloseTo(expected, 10);
  });

  it.each(["", "  ", "abc", "1,2,3", "12a", "1e5", "--1", "1..2,3", "Infinity", "10,5,"])(
    "rejeita %j",
    (input) => {
      expect(parseDecimal(input)).toBeNull();
    },
  );

  it("trata null e undefined como ausentes", () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });
});

describe("arredondamento monetário", () => {
  it("lineGrossCents reproduz round(quantidade × preço, 2) do banco", () => {
    expect(lineGrossCents(1.5, 33.33)).toBe(5000); // 49,995 -> 50,00
    expect(lineGrossCents(3, 0.33)).toBe(99);
    expect(lineGrossCents(2, 10)).toBe(2000);
    expect(lineGrossCents(0.333, 10)).toBe(333); // 3,33
    expect(lineGrossCents(0.335, 10)).toBe(335); // 3,35
    expect(lineGrossCents(1, 0)).toBe(0);
    expect(lineGrossCents(0.001, 0.5)).toBe(0); // 0,0005 -> 0,00
    expect(lineGrossCents(0.003, 0.5)).toBe(0); // 0,0015 -> 0,00
    expect(lineGrossCents(0.01, 0.5)).toBe(1); // 0,005 -> 0,01 (metade para cima)
  });

  it("roundMoney arredonda metade para cima sem erro de binário", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it("toCents evita sobras de ponto flutuante", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("decimalPlaces conta casas decimais", () => {
    expect(decimalPlaces(10)).toBe(0);
    expect(decimalPlaces(10.5)).toBe(1);
    expect(decimalPlaces(1.234)).toBe(3);
    expect(decimalPlaces(1e-7)).toBe(7);
  });
});
