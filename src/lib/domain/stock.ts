export const MOVEMENT_TYPES = [
  "initial",
  "entry",
  "manual_exit",
  "adjust_in",
  "adjust_out",
  "sale_exit",
  "sale_reversal",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Tipos que o usuário pode registrar manualmente (os demais são gerados pelo sistema). */
export const MANUAL_MOVEMENT_TYPES = ["entry", "manual_exit", "adjust_in", "adjust_out"] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  initial: "Estoque inicial",
  entry: "Entrada",
  manual_exit: "Saída manual",
  adjust_in: "Ajuste positivo",
  adjust_out: "Ajuste negativo",
  sale_exit: "Saída por venda",
  sale_reversal: "Estorno de venda",
};

/** +1 aumenta o saldo, -1 reduz. */
export function movementDirection(type: MovementType): 1 | -1 {
  return type === "initial" || type === "entry" || type === "adjust_in" || type === "sale_reversal" ? 1 : -1;
}

/** Agrupamento usado nos relatórios. */
export const MOVEMENT_GROUPS: { key: string; label: string; types: MovementType[] }[] = [
  { key: "entradas", label: "Entradas", types: ["initial", "entry"] },
  { key: "saidas", label: "Saídas", types: ["manual_exit", "sale_exit"] },
  { key: "ajustes", label: "Ajustes", types: ["adjust_in", "adjust_out"] },
  { key: "estornos", label: "Estornos de venda", types: ["sale_reversal"] },
];

export const UNITS = [
  { value: "un", label: "Unidade (un)", integer: true },
  { value: "cx", label: "Caixa (cx)", integer: true },
  { value: "pct", label: "Pacote (pct)", integer: true },
  { value: "par", label: "Par (par)", integer: true },
  { value: "kg", label: "Quilograma (kg)", integer: false },
  { value: "g", label: "Grama (g)", integer: false },
  { value: "l", label: "Litro (l)", integer: false },
  { value: "ml", label: "Mililitro (ml)", integer: false },
  { value: "m", label: "Metro (m)", integer: false },
] as const;
export type UnitCode = (typeof UNITS)[number]["value"];
export const UNIT_CODES = UNITS.map((u) => u.value) as [UnitCode, ...UnitCode[]];

export function isIntegerUnit(unit: string): boolean {
  return UNITS.find((u) => u.value === unit)?.integer ?? true;
}

export type StockStatus = "ok" | "low" | "out";
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  ok: "Em estoque",
  low: "Estoque baixo",
  out: "Sem estoque",
};

/** Mesma regra da view products_overview. */
export function stockStatus(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= minStock) return "low";
  return "ok";
}

export const PAYMENT_METHODS = ["cash", "pix", "credit_card", "debit_card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  other: "Outros",
};

export type SaleStatus = "completed" | "cancelled";
export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const DISCOUNT_TYPES = ["percentage", "amount_off", "fixed_price"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "Desconto percentual (%)",
  amount_off: "Desconto em reais (R$)",
  fixed_price: "Preço promocional fixo (R$)",
};

export type PromotionStatus = "scheduled" | "active" | "ended";
export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  scheduled: "Agendada",
  active: "Ativa",
  ended: "Encerrada",
};
