/** Mensagens de confirmação exibidas após redirecionamentos (?aviso=codigo). */
export const FLASH_MESSAGES: Record<string, string> = {
  "produto-criado": "Produto cadastrado com sucesso.",
  "produto-atualizado": "Produto atualizado com sucesso.",
  "categoria-excluida": "Categoria excluída.",
  "fornecedor-excluido": "Fornecedor excluído.",
  "cliente-criado": "Cliente cadastrado com sucesso.",
  "cliente-atualizado": "Cliente atualizado com sucesso.",
  "venda-registrada": "Venda registrada. O estoque foi atualizado.",
  "venda-cancelada": "Venda cancelada e estoque estornado.",
  "movimentacao-registrada": "Movimentação registrada e saldo atualizado.",
  "promocao-salva": "Promoção salva com sucesso.",
  "promocao-encerrada": "Promoção encerrada.",
  "empresa-criada": "Empresa criada. Cadastre seus primeiros produtos para começar.",
  "preco-aplicado": "Preço de venda atualizado no cadastro do produto.",
  "senha-redefinida": "Senha atualizada com sucesso.",
  "configuracoes-salvas": "Configurações salvas.",
};

export function flashMessage(code: string | string[] | undefined): string | null {
  const key = Array.isArray(code) ? code[0] : code;
  return key && Object.hasOwn(FLASH_MESSAGES, key) ? FLASH_MESSAGES[key] : null;
}
