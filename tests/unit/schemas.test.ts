import { describe, expect, it } from "vitest";
import { validate } from "@/lib/actions";
import { movementSchema, createProductSchema } from "@/features/produtos/schemas";
import { saleSchema } from "@/features/vendas/schemas";
import { promotionSchema } from "@/features/promocoes/schemas";
import { customerSchema } from "@/features/clientes/schemas";
import { companySchema } from "@/features/configuracoes/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";
const key = "33333333-3333-4333-8333-333333333333";

describe("produto", () => {
  const base = {
    name: "Café 500g",
    category_id: uuid,
    unit: "un",
    cost_price: "10,50",
    sale_price: "15,90",
    min_stock: "5",
    initial_stock: "20",
    idempotency_key: key,
  };

  it("aceita números no formato brasileiro", () => {
    const r = validate(createProductSchema, base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.cost_price).toBe(10.5);
      expect(r.data.initial_stock).toBe(20);
      expect(r.data.is_active).toBe(false); // checkbox ausente
    }
  });

  it("rejeita preço negativo e texto no lugar de número", () => {
    expect(validate(createProductSchema, { ...base, cost_price: "-1" }).ok).toBe(false);
    expect(validate(createProductSchema, { ...base, sale_price: "abc" }).ok).toBe(false);
  });

  it("rejeita quantidade fracionada em unidade inteira", () => {
    const r = validate(createProductSchema, { ...base, initial_stock: "2,5" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.state.fieldErrors?.initial_stock).toMatch(/inteiros/);
  });

  it("aceita quantidade fracionada em kg", () => {
    expect(validate(createProductSchema, { ...base, unit: "kg", initial_stock: "2,5", min_stock: "0,5" }).ok).toBe(true);
  });

  it("exige nome e categoria", () => {
    const r = validate(createProductSchema, { ...base, name: "  ", category_id: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.state.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "category_id"]));
  });
});

describe("movimentação", () => {
  const base = { product_id: uuid, type: "entry", quantity: "3", reason: "", idempotency_key: key };
  it("entrada simples é válida", () => expect(validate(movementSchema, base).ok).toBe(true));
  it("quantidade zero é inválida (exceto contagem)", () => {
    expect(validate(movementSchema, { ...base, quantity: "0" }).ok).toBe(false);
    expect(validate(movementSchema, { ...base, type: "count", quantity: "0", reason: "inventário" }).ok).toBe(true);
  });
  it("ajuste e contagem exigem motivo", () => {
    expect(validate(movementSchema, { ...base, type: "adjust_out" }).ok).toBe(false);
    expect(validate(movementSchema, { ...base, type: "adjust_out", reason: "quebra" }).ok).toBe(true);
  });
  it("tipo desconhecido (ex.: saída por venda) não pode ser registrado manualmente", () => {
    expect(validate(movementSchema, { ...base, type: "sale_exit" }).ok).toBe(false);
  });
});

describe("venda", () => {
  const item = { product_id: uuid, quantity: 2, discount: 0 };
  const base = { items: JSON.stringify([item]), payment_method: "pix", customer_id: "", idempotency_key: key };

  it("aceita venda válida sem cliente", () => {
    const r = validate(saleSchema, base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customer_id).toBeNull();
  });
  it("não aceita preço vindo do navegador (campo é ignorado)", () => {
    const r = validate(saleSchema, { ...base, items: JSON.stringify([{ ...item, unit_price: 0.01 }]) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items[0]).not.toHaveProperty("unit_price");
  });
  it("rejeita venda vazia, JSON inválido e produto repetido", () => {
    expect(validate(saleSchema, { ...base, items: "[]" }).ok).toBe(false);
    expect(validate(saleSchema, { ...base, items: "{" }).ok).toBe(false);
    expect(validate(saleSchema, { ...base, items: JSON.stringify([item, item]) }).ok).toBe(false);
  });
  it("rejeita quantidade zero/negativa e desconto negativo", () => {
    expect(validate(saleSchema, { ...base, items: JSON.stringify([{ ...item, quantity: 0 }]) }).ok).toBe(false);
    expect(validate(saleSchema, { ...base, items: JSON.stringify([{ ...item, quantity: -1 }]) }).ok).toBe(false);
    expect(validate(saleSchema, { ...base, items: JSON.stringify([{ ...item, discount: -5 }]) }).ok).toBe(false);
  });
  it("rejeita forma de pagamento inválida", () => {
    expect(validate(saleSchema, { ...base, payment_method: "bitcoin" }).ok).toBe(false);
  });
});

describe("promoção", () => {
  const base = {
    name: "Semana do cliente",
    discount_type: "percentage",
    discount_value: "10",
    starts_on: "2026-11-01",
    ends_on: "2026-11-07",
    product_ids: [uuid, uuid2],
  };
  it("aceita promoção válida", () => expect(validate(promotionSchema, base).ok).toBe(true));
  it("rejeita término anterior ao início", () => {
    expect(validate(promotionSchema, { ...base, ends_on: "2026-10-30" }).ok).toBe(false);
  });
  it("rejeita percentual acima de 100 e sem produtos", () => {
    expect(validate(promotionSchema, { ...base, discount_value: "101" }).ok).toBe(false);
    expect(validate(promotionSchema, { ...base, product_ids: [] }).ok).toBe(false);
  });
  it("rejeita data inexistente", () => {
    expect(validate(promotionSchema, { ...base, starts_on: "2026-02-31" }).ok).toBe(false);
  });
});

describe("cliente e empresa", () => {
  it("e-mail de cliente é opcional, mas validado", () => {
    expect(validate(customerSchema, { name: "Ana" }).ok).toBe(true);
    expect(validate(customerSchema, { name: "Ana", email: "ana@" }).ok).toBe(false);
  });
  it("configurações limitam margem e fuso horário", () => {
    const base = { name: "Loja", timezone: "America/Campo_Grande", default_min_stock: "5", min_margin_percent: "10" };
    expect(validate(companySchema, base).ok).toBe(true);
    expect(validate(companySchema, { ...base, min_margin_percent: "100" }).ok).toBe(false);
    expect(validate(companySchema, { ...base, timezone: "Mars/Olympus" }).ok).toBe(false);
  });
});
