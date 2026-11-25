import { describe, expect, it } from "vitest";
import { addDays, firstDayOfMonth, formatDateTime, formatIsoDate, isIsoDate, resolveDateRange, todayInTimezone } from "@/lib/domain/dates";
import { csvEscape, toCsv } from "@/lib/csv";
import { formatCurrency, formatPercent, formatQuantity, toInputMoney, toInputNumber } from "@/lib/format";
import { pageRange, parsePage, sanitizeSearch } from "@/lib/search";
import { isIntegerUnit, movementDirection, stockStatus } from "@/lib/domain/stock";

describe("datas", () => {
  it("valida datas ISO reais", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
  it("hoje respeita o fuso informado", () => {
    const instant = new Date("2026-03-10T02:30:00Z");
    expect(todayInTimezone("America/Cuiaba", instant)).toBe("2026-03-09"); // UTC-4
    expect(todayInTimezone("America/Sao_Paulo", instant)).toBe("2026-03-09"); // UTC-3
    expect(todayInTimezone("UTC", instant)).toBe("2026-03-10");
    expect(todayInTimezone("Fuso/Invalido", instant)).toBe("2026-03-10");
  });
  it("soma dias atravessando meses e anos", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(firstDayOfMonth("2026-07-19")).toBe("2026-07-01");
  });
  it("período padrão: do primeiro dia do mês até hoje; inverte datas trocadas", () => {
    expect(resolveDateRange(undefined, undefined, "2026-07-19")).toEqual({ from: "2026-07-01", to: "2026-07-19" });
    expect(resolveDateRange("2026-07-10", "2026-07-05", "2026-07-19")).toEqual({ from: "2026-07-05", to: "2026-07-10" });
    expect(resolveDateRange("lixo", "2026-07-05", "2026-07-19")).toEqual({ from: "2026-07-01", to: "2026-07-05" });
  });
  it("formata datas no padrão brasileiro", () => {
    expect(formatIsoDate("2026-03-09")).toBe("09/03/2026");
    expect(formatIsoDate(null)).toBe("—");
    expect(formatDateTime("2026-03-10T02:30:00Z", "America/Cuiaba")).toBe("09/03/2026 22:30");
  });
});

describe("formatação", () => {
  it("moeda, quantidade e percentual em pt-BR", () => {
    expect(formatCurrency(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatCurrency(null)).toBe("—");
    expect(formatQuantity(10, "un")).toBe("10");
    expect(formatQuantity(10.5, "kg")).toBe("10,5");
    expect(formatQuantity(1234.567, "kg")).toBe("1.234,567");
    expect(formatPercent(33.333)).toBe("33,33%");
  });
  it("valores de input usam vírgula e sem separador de milhar", () => {
    expect(toInputNumber(1234.5)).toBe("1234,5");
    expect(toInputMoney(10)).toBe("10,00");
    expect(toInputMoney(null)).toBe("");
  });
});

describe("estoque", () => {
  it("classifica a situação e a direção da movimentação", () => {
    expect(stockStatus(0, 5)).toBe("out");
    expect(stockStatus(5, 5)).toBe("low");
    expect(stockStatus(6, 5)).toBe("ok");
    expect(stockStatus(1, 0)).toBe("ok");
    expect(movementDirection("entry")).toBe(1);
    expect(movementDirection("sale_reversal")).toBe(1);
    expect(movementDirection("sale_exit")).toBe(-1);
    expect(movementDirection("adjust_out")).toBe(-1);
    expect(isIntegerUnit("un")).toBe(true);
    expect(isIntegerUnit("kg")).toBe(false);
  });
});

describe("CSV", () => {
  it("usa ; como separador, vírgula decimal, BOM e CRLF", () => {
    const csv = toCsv([{ a: "Arroz", b: 10.5 }], [
      { header: "Nome", value: (r) => r.a },
      { header: "Preço", value: (r) => r.b },
    ]);
    expect(csv).toBe("﻿Nome;Preço\r\nArroz;10,5\r\n");
  });
  it("escapa aspas, separadores e quebras de linha", () => {
    expect(csvEscape('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
    expect(csvEscape("a;b")).toBe('"a;b"');
    expect(csvEscape("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });
  it("neutraliza injeção de fórmulas e trata nulos/booleanos", () => {
    expect(csvEscape("=SOMA(A1:A2)")).toBe("'=SOMA(A1:A2)");
    expect(csvEscape("+55 67")).toBe("'+55 67");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(true)).toBe("Sim");
    expect(csvEscape(Number.NaN)).toBe("");
    expect(csvEscape(-5)).toBe("-5"); // números negativos não são "fórmulas"
  });
});

describe("busca e paginação", () => {
  it("remove caracteres especiais da sintaxe de filtros", () => {
    expect(sanitizeSearch('arroz,(tipo) "1"*%_')).toBe("arroz tipo 1");
    expect(sanitizeSearch(undefined)).toBe("");
    expect(sanitizeSearch("x".repeat(100)).length).toBe(60);
  });
  it("página inválida cai para 1 e o intervalo é calculado", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(pageRange(3, 20)).toEqual({ from: 40, to: 59 });
  });
});

import { localRangeIso, startOfLocalDayIso } from "@/lib/domain/dates";

describe("limites de dia no fuso da empresa", () => {
  it("America/Sao_Paulo (UTC-3) começa às 03:00 UTC", () => {
    expect(startOfLocalDayIso("2026-10-21", "America/Sao_Paulo")).toBe("2026-10-21T03:00:00.000Z");
  });
  it("America/Campo_Grande (UTC-4) começa às 04:00 UTC", () => {
    expect(startOfLocalDayIso("2026-10-21", "America/Campo_Grande")).toBe("2026-10-21T04:00:00.000Z");
  });
  it("intervalo é fechado no início e aberto no fim", () => {
    expect(localRangeIso("2026-10-01", "2026-10-02", "UTC")).toEqual({
      start: "2026-10-01T00:00:00.000Z",
      endExclusive: "2026-10-03T00:00:00.000Z",
    });
  });
});
