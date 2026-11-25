import { describe, expect, it } from "vitest";
import { analyzePrice, applyDiscount, breakEvenPrice, calculatePricing, profitForUnits, suggestedPrice } from "@/lib/domain/pricing";

describe("precificação: margem sobre o preço de venda × acréscimo sobre o custo", () => {
  it("preço sugerido para margem de 50% é o DOBRO do custo (acréscimo de 100%)", () => {
    expect(suggestedPrice(10, 50)).toBe(20);
    const a = analyzePrice(10, 20);
    expect(a.marginPercent).toBe(50);
    expect(a.markupPercent).toBe(100);
  });

  it("margem de 30% sobre custo de R$ 70 => preço R$ 100", () => {
    expect(suggestedPrice(70, 30)).toBe(100);
    expect(analyzePrice(70, 100)).toMatchObject({ grossProfit: 30, marginPercent: 30 });
    expect(analyzePrice(70, 100).markupPercent).toBeCloseTo(42.86, 2);
  });

  it("margem 0% => preço igual ao custo", () => {
    expect(suggestedPrice(12.34, 0)).toBe(12.34);
  });

  it("arredonda o preço sugerido ao centavo e recalcula a margem a partir do preço arredondado", () => {
    const price = suggestedPrice(7.33, 35);
    expect(price).toBe(11.28); // 7,33 / 0,65 = 11,2769...
    const a = analyzePrice(7.33, price);
    expect(a.marginPercent).toBeCloseTo(35.02, 2);
  });

  it("rejeita margem fora do intervalo (100% é impossível)", () => {
    expect(() => suggestedPrice(10, 100)).toThrow(RangeError);
    expect(() => suggestedPrice(10, -1)).toThrow(RangeError);
    expect(() => suggestedPrice(10, Number.NaN)).toThrow(RangeError);
  });

  it("custo zero não gera margem indefinida", () => {
    expect(analyzePrice(0, 10)).toMatchObject({ grossProfit: 10, marginPercent: 100, markupPercent: null });
    expect(analyzePrice(5, 0)).toMatchObject({ grossProfit: -5, marginPercent: null });
  });
});

describe("desconto", () => {
  it("desconto percentual: preço, lucro e margem após desconto", () => {
    const r = applyDiscount(60, 100, { type: "percent", value: 10 }, 10);
    expect(r).toMatchObject({ price: 90, discountAmount: 10, grossProfit: 30, belowCost: false, belowMinMargin: false });
    expect(r.marginPercent).toBeCloseTo(33.33, 2);
  });

  it("alerta quando o desconto deixa o preço abaixo do custo", () => {
    const r = applyDiscount(60, 100, { type: "percent", value: 45 });
    expect(r.price).toBe(55);
    expect(r.belowCost).toBe(true);
    expect(r.belowMinMargin).toBe(false);
    expect(r.grossProfit).toBe(-5);
  });

  it("alerta quando a margem fica abaixo do limite configurado (mas acima do custo)", () => {
    const r = applyDiscount(80, 100, { type: "percent", value: 10 }, 15);
    expect(r.price).toBe(90);
    expect(r.belowCost).toBe(false);
    expect(r.belowMinMargin).toBe(true); // margem 11,11% < 15%
  });

  it("desconto em reais nunca passa do preço", () => {
    const r = applyDiscount(10, 20, { type: "amount", value: 500 });
    expect(r.price).toBe(0);
    expect(r.discountAmount).toBe(20);
    expect(r.belowCost).toBe(true);
  });

  it("calculatePricing combina sugerido, atual e desconto", () => {
    const r = calculatePricing({ cost: 50, desiredMarginPercent: 50, currentPrice: 80, discount: { type: "percent", value: 20 }, minMarginPercent: 10 });
    expect(r.suggested.price).toBe(100);
    expect(r.current).toMatchObject({ price: 80, grossProfit: 30, marginPercent: 37.5 });
    expect(r.discountOnSuggested).toMatchObject({ price: 80, grossProfit: 30 });
    expect(r.discountOnCurrent).toMatchObject({ price: 64, grossProfit: 14 });
  });

  it("sem desconto informado não há análise de desconto", () => {
    const r = calculatePricing({ cost: 50, desiredMarginPercent: 20 });
    expect(r.discountOnSuggested).toBeNull();
    expect(r.discountOnCurrent).toBeNull();
    expect(r.current).toBeNull();
  });
});

describe("precificação com despesas adicionais", () => {
  it("sem despesas o resultado é idêntico ao cálculo original", () => {
    expect(suggestedPrice(70, 30, {})).toBe(100);
    expect(suggestedPrice(70, 30, { extraCost: 0, variablePercent: 0 })).toBe(100);
    expect(analyzePrice(70, 100, { extraCost: 0, variablePercent: 0 })).toMatchObject({ grossProfit: 30, marginPercent: 30 });
  });

  it("encargos sobre o preço: preço = custo ÷ (1 − encargos − margem)", () => {
    // custo 50 + frete 10 = 60; imposto+taxa 10%; margem 30% => 60 / 0,60 = 100
    const price = suggestedPrice(50, 30, { extraCost: 10, variablePercent: 10 });
    expect(price).toBe(100);
    const a = analyzePrice(50, price, { extraCost: 10, variablePercent: 10 });
    expect(a).toMatchObject({ price: 100, acquisitionCost: 50, extraCost: 10, variableCharges: 10, grossProfit: 30, marginPercent: 30 });
    expect(a.markupPercent).toBe(50); // 30 de lucro sobre 60 de custo total
  });

  it("a margem obtida confere com a margem desejada (propriedade) para vários cenários", () => {
    for (const [cost, extra, v, m] of [
      [12.34, 1.5, 4, 25], [99.9, 0, 12.5, 40], [3.5, 0.25, 2.99, 15], [250, 18, 8, 22.5], [0.99, 0, 0, 60],
    ] as const) {
      const price = suggestedPrice(cost, m, { extraCost: extra, variablePercent: v });
      const a = analyzePrice(cost, price, { extraCost: extra, variablePercent: v });
      // O arredondamento ao centavo pode deslocar a margem em, no máximo, ~0,5 centavo ÷ preço.
      expect(Math.abs((a.marginPercent as number) - m)).toBeLessThan((0.6 / price) * 100 + 0.01);
    }
  });

  it("rejeita encargos + margem ≥ 100% e encargos inválidos", () => {
    expect(() => suggestedPrice(10, 60, { variablePercent: 40 })).toThrow(RangeError);
    expect(() => suggestedPrice(10, 10, { variablePercent: 100 })).toThrow(RangeError);
    expect(() => breakEvenPrice(10, { variablePercent: 100 })).toThrow(RangeError);
    expect(suggestedPrice(10, 59.99, { variablePercent: 40 })).toBeGreaterThan(0);
  });

  it("preço de equilíbrio: lucro zero (ou mínimo positivo) e nunca prejuízo", () => {
    expect(breakEvenPrice(60, { variablePercent: 0 })).toBe(60);
    const be = breakEvenPrice(50, { extraCost: 10, variablePercent: 10 }); // 60 / 0,9 = 66,666… -> 66,67
    expect(be).toBe(66.67);
    expect(analyzePrice(50, be, { extraCost: 10, variablePercent: 10 }).grossProfit).toBeGreaterThanOrEqual(0);
    expect(analyzePrice(50, be - 0.01, { extraCost: 10, variablePercent: 10 }).grossProfit).toBeLessThan(0);
  });

  it("desconto considera as despesas: pode dar prejuízo mesmo acima do custo de aquisição", () => {
    const r = applyDiscount(50, 100, { type: "percent", value: 40 }, 10, { extraCost: 10, variablePercent: 10 });
    // preço 60: custo total 60 + 6 de encargos => prejuízo de 6
    expect(r).toMatchObject({ price: 60, grossProfit: -6, belowCost: true });
  });

  it("calculatePricing devolve o preço de equilíbrio e analisa o preço atual com as mesmas despesas", () => {
    const r = calculatePricing({ cost: 50, extraCost: 10, variablePercent: 10, desiredMarginPercent: 30, currentPrice: 80 });
    expect(r.suggested.price).toBe(100);
    expect(r.breakEvenPrice).toBe(66.67);
    expect(r.current).toMatchObject({ price: 80, variableCharges: 8, grossProfit: 12, marginPercent: 15 });
  });

  it("lucro de um volume mensal sem erro de ponto flutuante", () => {
    expect(profitForUnits(0.1, 3)).toBe(0.3);
    expect(profitForUnits(12.34, 100)).toBe(1234);
    expect(profitForUnits(-6, 10)).toBe(-60);
  });
});
