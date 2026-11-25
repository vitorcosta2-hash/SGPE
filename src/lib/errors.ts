/**
 * Tradução de erros do banco/PostgREST em mensagens claras para o usuário.
 * Mensagens internas (SQL, nomes de tabelas, stack) nunca são exibidas.
 */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

const GENERIC = "Não foi possível concluir a operação. Tente novamente em instantes.";

const SG005_MESSAGES: Record<string, string> = {
  invalid_quantity: "Quantidade inválida. Informe um valor maior que zero (unidades inteiras não aceitam frações).",
  reason_required: "Informe o motivo da movimentação (mínimo de 3 caracteres).",
  invalid_reason: "O motivo é muito longo (máximo de 500 caracteres).",
  no_difference: "A quantidade contada é igual ao saldo atual. Nenhum ajuste foi necessário.",
  invalid_movement_type: "Tipo de movimentação não permitido.",
  unit_locked: "A unidade de medida não pode ser alterada depois que o produto tem movimentações.",
  invalid_period: "A data de término deve ser igual ou posterior à data de início.",
  no_products: "Selecione ao menos um produto para a promoção.",
  too_many_items: "Quantidade de itens acima do limite permitido.",
  promotion_ended: "Promoções encerradas não podem ser editadas.",
  invalid_discount: "Desconto inválido.",
  discount_exceeds_total: "O desconto não pode ser maior que o valor do item.",
  invalid_items: "Há itens inválidos ou repetidos na venda.",
  invalid_notes: "A observação é muito longa (máximo de 500 caracteres).",
  payment_method_required: "Selecione a forma de pagamento.",
  company_limit: "Limite de empresas por usuário atingido.",
  invalid_company_name: "Informe o nome da empresa (2 a 120 caracteres).",
  invalid_timezone: "Fuso horário inválido.",
};

const SG006_MESSAGES: Record<string, string> = {
  product_not_found: "Produto não encontrado.",
  category_not_found: "Categoria não encontrada.",
  supplier_not_found: "Fornecedor não encontrado.",
  customer_not_found: "Cliente não encontrado.",
  sale_not_found: "Venda não encontrada.",
  promotion_not_found: "Promoção não encontrada.",
};

export function describeDbError(error: DbErrorLike | null | undefined): string {
  if (!error) return GENERIC;
  const code = error.code ?? "";
  const message = error.message ?? "";
  const details = error.details ?? "";

  switch (code) {
    case "42501":
      return "Você não tem permissão para realizar esta operação.";
    case "SG001": {
      const [name, available, requested] = details.split("|");
      if (name && available !== undefined && requested !== undefined) {
        return `Saldo insuficiente para "${name}": disponível ${trimZeros(available)}, solicitado ${trimZeros(requested)}.`;
      }
      return "Saldo de estoque insuficiente para esta operação.";
    }
    case "SG003":
      return details ? `O produto "${details}" está inativo e não pode ser vendido.` : "Há produto inativo na venda.";
    case "SG004":
      return "Esta venda já foi cancelada.";
    case "SG005":
      return SG005_MESSAGES[message] ?? (details || "Dados inválidos. Revise as informações e tente novamente.");
    case "SG006":
      return SG006_MESSAGES[message] ?? "Registro não encontrado.";
    case "SG007":
      return "Adicione ao menos um item à venda.";
    case "SG008":
      return "Este registro faz parte do histórico e não pode ser alterado. Registre um ajuste ou estorno.";
    case "23505":
      if (message.includes("products_company_sku_uq")) return "Já existe um produto com este código (SKU) nesta empresa.";
      if (message.includes("products_company_barcode_uq")) return "Já existe um produto com este código de barras nesta empresa.";
      if (message.includes("categories_company_name_uq")) return "Já existe uma categoria com este nome.";
      return "Já existe um registro com estes dados.";
    case "23503":
      if (message.includes("products_company_id_category_id_fkey")) {
        return "Esta categoria possui produtos associados. Mova os produtos para outra categoria antes de excluí-la.";
      }
      return "Este registro está em uso por outros dados e não pode ser removido.";
    case "23514":
      return "Algum valor informado é inválido. Revise os campos e tente novamente.";
    case "22P02":
    case "22007":
    case "22008":
      return "Algum valor informado tem formato inválido.";
    case "22003":
    case "22001":
      return "Algum valor informado é grande demais.";
    case "PGRST301":
    case "PGRST303":
      return "Sua sessão expirou. Entre novamente.";
    default:
      return GENERIC;
  }
}

function trimZeros(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}

/** Registra no servidor apenas código e mensagem técnica (sem dados de usuário). */
export function logDbError(context: string, error: DbErrorLike | null | undefined): void {
  if (!error) return;
  console.error(`[sgpe] ${context}: code=${error.code ?? "?"} message=${error.message ?? "?"}`);
}
