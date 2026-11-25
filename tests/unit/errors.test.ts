import { describe, expect, it } from "vitest";
import { describeDbError } from "@/lib/errors";

describe("tradução de erros do banco", () => {
  it("saldo insuficiente mostra produto, disponível e solicitado", () => {
    expect(describeDbError({ code: "SG001", message: "insufficient_stock", details: "Arroz 5kg|3.000|4" })).toBe(
      'Saldo insuficiente para "Arroz 5kg": disponível 3, solicitado 4.',
    );
  });
  it("não expõe mensagens internas desconhecidas", () => {
    const msg = describeDbError({ code: "XX000", message: 'relation "public.secret" does not exist' });
    expect(msg).not.toContain("secret");
    expect(msg).toContain("Não foi possível");
  });
  it("mapeia duplicidades pelo nome da restrição", () => {
    expect(describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "products_company_sku_uq"' })).toContain("código (SKU)");
    expect(describeDbError({ code: "23505", message: 'duplicate key value violates unique constraint "categories_company_name_uq"' })).toContain("categoria");
  });
  it("categoria em uso explica o motivo", () => {
    expect(describeDbError({ code: "23503", message: 'update or delete on table "categories" violates foreign key constraint "products_company_id_category_id_fkey" on table "products"' })).toContain("produtos associados");
  });
  it("permissão, venda cancelada, motivo obrigatório, histórico imutável e sessão expirada", () => {
    expect(describeDbError({ code: "42501" })).toContain("permissão");
    expect(describeDbError({ code: "SG004" })).toContain("já foi cancelada");
    expect(describeDbError({ code: "SG005", message: "reason_required" })).toContain("motivo");
    expect(describeDbError({ code: "SG008" })).toContain("histórico");
    expect(describeDbError({ code: "PGRST301" })).toContain("sessão");
    expect(describeDbError({ code: "SG003", details: "Caneta" })).toContain('"Caneta"');
    expect(describeDbError({ code: "SG007" })).toContain("ao menos um item");
  });
  it("sem erro ou código desconhecido devolve mensagem genérica", () => {
    expect(describeDbError(null)).toContain("Não foi possível");
    expect(describeDbError({})).toContain("Não foi possível");
  });
});
