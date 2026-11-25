import { fromCents, toCents } from "./money";

/**
 * Fórmulas de precificação (todas documentadas na tela de Precificação):
 *
 *   Margem (sobre o preço de venda) = (preço − custo) ÷ preço × 100
 *   Acréscimo sobre o custo (markup) = (preço − custo) ÷ custo × 100
 *   Preço sugerido para uma margem m  = custo ÷ (1 − m ÷ 100)
 *   Preço com desconto                = preço − desconto
 *
 * Margem e acréscimo são conceitos DIFERENTES: vender com 50% de margem exige
 * 100% de acréscimo sobre o custo.
 *
 * Despesas adicionais (opcionais):
 *   - extraCost: valor fixo POR UNIDADE (frete, embalagem...), somado ao custo;
 *   - variablePercent: percentual SOBRE O PREÇO DE VENDA (impostos, taxa do cartão,
 *     comissão). Como incide sobre o preço, o preço sugerido passa a ser
 *       preço = (custo + extraCost) ÷ (1 − variablePercent ÷ 100 − margem ÷ 100)
 *     e o lucro é preço − custo total − (preço × variablePercent ÷ 100).
 *
 * Sem despesas informadas, todas as fórmulas se reduzem às originais.
 * Os resultados são estimativas: não consideram despesas fixas do negócio (aluguel, salários).
 */

/** Despesas além do custo de aquisição. Ambas opcionais (padrão: zero). */
export interface PriceExpenses {
  /** Valor por unidade (R$), ex.: frete e embalagem. */
  extraCost?: number;
  /** Percentual sobre o preço de venda (0 a 99,99), ex.: impostos e taxa do cartão. */
  variablePercent?: number;
}

export interface PricingInput extends PriceExpenses {
  cost: number;
  /** Margem de lucro desejada sobre o preço de venda, em % (0 a 99,99). */
  desiredMarginPercent: number;
  /** Preço de venda atual (opcional, para comparar). */
  currentPrice?: number | null;
  /** Desconto pretendido (opcional). */
  discount?: { type: "percent" | "amount"; value: number } | null;
  /** Margem mínima aceitável, em %, configurada pela empresa. */
  minMarginPercent?: number;
}

export interface PriceAnalysis {
  price: number;
  /** Lucro estimado por unidade: preço − custo − despesas − encargos sobre o preço. */
  grossProfit: number;
  marginPercent: number | null;
  /** Lucro ÷ custo total (custo + despesas por unidade). */
  markupPercent: number | null;
  /** Composição do preço, em reais por unidade. */
  acquisitionCost: number;
  extraCost: number;
  /** Encargos percentuais sobre o preço (impostos, taxas), em reais. */
  variableCharges: number;
}

export interface DiscountAnalysis extends PriceAnalysis {
  discountAmount: number;
  belowCost: boolean;
  belowMinMargin: boolean;
}

export interface PricingResult {
  suggested: PriceAnalysis;
  /** Análise do preço atual informado (se houver). */
  current: PriceAnalysis | null;
  /** Efeito do desconto sobre o preço sugerido. */
  discountOnSuggested: DiscountAnalysis | null;
  /** Efeito do desconto sobre o preço atual (se houver preço atual e desconto). */
  discountOnCurrent: DiscountAnalysis | null;
  /** Menor preço sem prejuízo (lucro zero), considerando as despesas informadas. */
  breakEvenPrice: number;
}

function expensesInCents(expenses: PriceExpenses = {}) {
  const extraCents = Math.max(0, toCents(expenses.extraCost ?? 0));
  const variableBp = Math.max(0, Math.round((expenses.variablePercent ?? 0) * 100)); // centésimos de %
  return { extraCents, variableBp };
}

/**
 * Preço sugerido (em reais, arredondado ao centavo) para uma margem desejada.
 * preço = custo total ÷ (1 − encargos% − margem%).
 */
export function suggestedPrice(cost: number, marginPercent: number, expenses: PriceExpenses = {}): number {
  if (!(marginPercent >= 0) || marginPercent >= 100) throw new RangeError("A margem deve estar entre 0 e 99,99%.");
  const { extraCents, variableBp } = expensesInCents(expenses);
  if (variableBp >= 10000) throw new RangeError("As taxas e impostos devem ser menores que 100%.");
  // Em centésimos de %: 10000 − encargos − margem.
  const divisorBp = 10000 - variableBp - Math.round(marginPercent * 100);
  if (divisorBp <= 0) {
    throw new RangeError("A soma da margem com as taxas e impostos precisa ser menor que 100%.");
  }
  const totalCostCents = toCents(cost) + extraCents;
  return fromCents(Math.round((totalCostCents * 10000) / divisorBp));
}

/** Menor preço que não dá prejuízo: custo total ÷ (1 − encargos%), arredondado para cima ao centavo. */
export function breakEvenPrice(cost: number, expenses: PriceExpenses = {}): number {
  const { extraCents, variableBp } = expensesInCents(expenses);
  if (variableBp >= 10000) throw new RangeError("As taxas e impostos devem ser menores que 100%.");
  const totalCostCents = toCents(cost) + extraCents;
  return fromCents(Math.ceil((totalCostCents * 10000) / (10000 - variableBp) - 1e-9));
}

export function analyzePrice(cost: number, price: number, expenses: PriceExpenses = {}): PriceAnalysis {
  const { extraCents, variableBp } = expensesInCents(expenses);
  const acquisitionCents = toCents(cost);
  const priceCents = toCents(price);
  const variableCents = Math.round((priceCents * variableBp) / 10000);
  const totalCostCents = acquisitionCents + extraCents;
  const profitCents = priceCents - totalCostCents - variableCents;
  return {
    price: fromCents(priceCents),
    grossProfit: fromCents(profitCents),
    marginPercent: priceCents > 0 ? roundPercent((profitCents / priceCents) * 100) : null,
    markupPercent: totalCostCents > 0 ? roundPercent((profitCents / totalCostCents) * 100) : null,
    acquisitionCost: fromCents(acquisitionCents),
    extraCost: fromCents(extraCents),
    variableCharges: fromCents(variableCents),
  };
}

/** Lucro de um volume de vendas (ex.: unidades por mês), em reais, sem erro de ponto flutuante. */
export function profitForUnits(profitPerUnit: number, units: number): number {
  return fromCents(Math.round(toCents(profitPerUnit) * units));
}

export function applyDiscount(
  cost: number,
  price: number,
  discount: { type: "percent" | "amount"; value: number },
  minMarginPercent = 0,
  expenses: PriceExpenses = {},
): DiscountAnalysis {
  const priceCents = toCents(price);
  const discountCents =
    discount.type === "percent"
      ? Math.round((priceCents * Math.round(discount.value * 100)) / 10000)
      : Math.min(toCents(discount.value), priceCents);
  const afterCents = Math.max(0, priceCents - discountCents);
  const analysis = analyzePrice(cost, fromCents(afterCents), expenses);
  const belowCost = analysis.grossProfit < 0;
  return {
    ...analysis,
    discountAmount: fromCents(discountCents),
    belowCost,
    belowMinMargin: !belowCost && analysis.marginPercent !== null && analysis.marginPercent < minMarginPercent,
  };
}

export function calculatePricing(input: PricingInput): PricingResult {
  const expenses: PriceExpenses = { extraCost: input.extraCost, variablePercent: input.variablePercent };
  const suggestedValue = suggestedPrice(input.cost, input.desiredMarginPercent, expenses);
  const suggested = analyzePrice(input.cost, suggestedValue, expenses);
  const hasCurrent = input.currentPrice != null && input.currentPrice > 0;
  const current = hasCurrent ? analyzePrice(input.cost, input.currentPrice as number, expenses) : null;
  const discount = input.discount && input.discount.value > 0 ? input.discount : null;

  return {
    suggested,
    current,
    discountOnSuggested: discount ? applyDiscount(input.cost, suggested.price, discount, input.minMarginPercent, expenses) : null,
    discountOnCurrent:
      discount && hasCurrent
        ? applyDiscount(input.cost, input.currentPrice as number, discount, input.minMarginPercent, expenses)
        : null,
    breakEvenPrice: breakEvenPrice(input.cost, expenses),
  };
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
