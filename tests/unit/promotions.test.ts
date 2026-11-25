import { describe, expect, it } from "vitest";
import { describeDiscount, promoPrice, promotionStatus } from "@/lib/domain/promotions";

describe("preço promocional", () => {
  it("percentual, valor e preço fixo", () => {
    expect(promoPrice("percentage", 15, 100)).toBe(85);
    expect(promoPrice("percentage", 33.33, 10)).toBe(6.67);
    expect(promoPrice("amount_off", 30, 100)).toBe(70);
    expect(promoPrice("fixed_price", 60, 100)).toBe(60);
  });
  it("nunca é negativo nem maior que o preço base", () => {
    expect(promoPrice("amount_off", 500, 100)).toBe(0);
    expect(promoPrice("fixed_price", 150, 100)).toBe(100);
    expect(promoPrice("percentage", 99.99, 0.5)).toBe(0);
  });
});

describe("status da promoção", () => {
  it("agendada, ativa e encerrada", () => {
    expect(promotionStatus("2026-05-10", "2026-05-20", null, "2026-05-09")).toBe("scheduled");
    expect(promotionStatus("2026-05-10", "2026-05-20", null, "2026-05-10")).toBe("active");
    expect(promotionStatus("2026-05-10", "2026-05-20", null, "2026-05-20")).toBe("active");
    expect(promotionStatus("2026-05-10", "2026-05-20", null, "2026-05-21")).toBe("ended");
  });
  it("encerramento manual vale mesmo dentro do período", () => {
    expect(promotionStatus("2026-05-10", "2026-05-20", "2026-05-12T10:00:00Z", "2026-05-15")).toBe("ended");
  });
});

describe("descrição do desconto", () => {
  const money = (n: number) => `R$ ${n}`;
  it("formata cada tipo", () => {
    expect(describeDiscount("percentage", 12.5, money)).toBe("12,5% de desconto");
    expect(describeDiscount("amount_off", 5, money)).toBe("R$ 5 de desconto");
    expect(describeDiscount("fixed_price", 9.9, money)).toBe("Por R$ 9.9");
  });
});
