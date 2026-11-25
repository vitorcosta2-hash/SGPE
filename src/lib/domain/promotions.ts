import type { DiscountType, PromotionStatus } from "./stock";

/**
 * Preço promocional — mesma regra da função SQL private.promo_price:
 * nunca fica abaixo de zero nem acima do preço base.
 * Trabalha em centavos para reproduzir o arredondamento do banco.
 */
export function promoPrice(type: DiscountType, value: number, basePrice: number): number {
  const baseCents = Math.round(basePrice * 100);
  const valueCents = Math.round(value * 100);
  let resultCents: number;
  switch (type) {
    case "percentage":
      resultCents = Math.floor((baseCents * (10000 - valueCents) + 5000) / 10000);
      break;
    case "amount_off":
      resultCents = baseCents - valueCents;
      break;
    case "fixed_price":
      resultCents = valueCents;
      break;
  }
  return Math.min(baseCents, Math.max(0, resultCents)) / 100;
}

/** Status da promoção em uma data (YYYY-MM-DD) já no fuso da empresa. */
export function promotionStatus(
  startsOn: string,
  endsOn: string,
  endedAt: string | null,
  today: string,
): PromotionStatus {
  if (endedAt || today > endsOn) return "ended";
  if (today < startsOn) return "scheduled";
  return "active";
}

/** Descrição curta do desconto para listas. */
export function describeDiscount(type: DiscountType, value: number, formatMoney: (n: number) => string): string {
  switch (type) {
    case "percentage":
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}% de desconto`;
    case "amount_off":
      return `${formatMoney(value)} de desconto`;
    case "fixed_price":
      return `Por ${formatMoney(value)}`;
  }
}
