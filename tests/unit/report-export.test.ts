import { describe, expect, it } from "vitest";
import { tableToCsv, tableToXlsx, isProfitOrder, isReportKind, type ReportTable } from "@/features/relatorios/export";

const table: ReportTable = {
  slug: "lucratividade",
  title: "Lucratividade",
  headers: ["Produto", "Vendido", "Faturamento", "Margem"],
  types: ["text", "qty", "money", "percent"],
  rows: [
    ["Camiseta", 3, 149.7, 55.56],
    ["=HYPERLINK(\"x\")", 1, 10, null],
  ],
};

describe("exportação de relatórios", () => {
  it("CSV: cabeçalho, vírgula decimal e proteção contra fórmulas", () => {
    const csv = tableToCsv(table);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Produto;Vendido;Faturamento;Margem");
    expect(csv).toContain("Camiseta;3;149,7;55,56");
    expect(csv).toContain("'=HYPERLINK");
  });

  it("Excel: gera um .xlsx válido (zip) com os textos e números", async () => {
    const buffer = await tableToXlsx(table, "Loja · 01/11/2026 a 30/11/2026");
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    // O conteúdo das planilhas fica compactado; a lista de arquivos do zip aparece em texto puro.
    const names = buffer.toString("latin1");
    expect(names).toContain("xl/workbook.xml");
    expect(names).toContain("xl/worksheets/sheet1.xml");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("valida tipos de relatório e ordenações", () => {
    expect(isReportKind("faturamento")).toBe(true);
    expect(isReportKind("mais-vendidos")).toBe(true);
    expect(isReportKind("qualquer")).toBe(false);
    expect(isProfitOrder("margem")).toBe(true);
    expect(isProfitOrder("x; drop")).toBe(false);
  });
});
