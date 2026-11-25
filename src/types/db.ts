import type { DiscountType, MovementType, PaymentMethod, PromotionStatus, SaleStatus, StockStatus } from "@/lib/domain/stock";

export type CompanyRole = "owner" | "manager" | "staff";

export interface Company {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  currency: string;
  timezone: string;
  default_min_stock: number;
  min_margin_percent: number;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
}

export interface CategoryRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  company_id: string;
  category_id: string;
  category_name: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  min_stock: number;
  is_active: boolean;
  stock_status: StockStatus;
  stock_value: number;
  promotion_id: string | null;
  promotion_name: string | null;
  effective_price: number;
  supplier_id: string | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovementRow {
  id: string;
  seq: number;
  company_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  type: MovementType;
  quantity: number;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  sale_id: string | null;
  sale_number: number | null;
  created_by_name: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleRow {
  id: string;
  company_id: string;
  sale_number: number;
  customer_id: string | null;
  customer_name: string | null;
  payment_method: PaymentMethod;
  status: SaleStatus;
  subtotal: number;
  discount_total: number;
  total: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  items_count: number;
}

export interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  unit: string;
  quantity: number;
  base_price: number;
  unit_price: number;
  discount: number;
  line_total: number;
  promotion_id: string | null;
}

export interface PromotionRow {
  id: string;
  company_id: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  starts_on: string;
  ends_on: string;
  ended_at: string | null;
  created_at: string;
  status: PromotionStatus;
  product_count: number;
}

export interface PromotionProductRow {
  promotion_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  sale_price: number;
  is_active: boolean;
}

export interface StockSummary {
  total_products: number;
  active_products: number;
  low_stock: number;
  out_of_stock: number;
  stock_value: number;
}

export interface MovementSummaryItem {
  type: MovementType;
  count: number;
  quantity: number;
}

export interface SalesSummary {
  completed_count: number;
  completed_total: number;
  discount_total: number;
  cancelled_count: number;
  cancelled_total: number;
  by_payment: { method: PaymentMethod; count: number; total: number }[];
  top_products: { product_id: string; name: string; sku: string | null; unit: string; quantity: number; total: number }[];
}

/** Totais de um período (report_period_metrics). Lucro = receita − custo gravado na venda. */
export interface PeriodMetrics {
  sales_count: number;
  revenue: number;
  discounts: number;
  cost: number;
  profit: number;
  margin_percent: number | null;
  avg_ticket: number;
  units_sold: number;
  cancelled_count: number;
}

export interface DailyPoint {
  day: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface ProductProfitRow {
  product_id: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_percent: number | null;
}

/** Resultado real de uma promoção (report_promotion_results): só vendas concluídas feitas com ela. */
export interface PromotionResults {
  sales_count: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  discount_given: number;
  by_product: { product_id: string; name: string; unit: string; quantity: number; revenue: number; profit: number }[];
}
