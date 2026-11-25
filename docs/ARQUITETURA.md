# Arquitetura e decisões

## Princípios
1. **O banco é a fonte da verdade** para estoque e vendas. Regras críticas ficam em funções SQL transacionais; o front-end só valida para dar feedback rápido.
2. **Um único ponto de alteração de saldo:** `private.apply_stock_movement`. Ele trava a linha do produto (`for update`), calcula saldo anterior/posterior,
   impede saldo negativo e grava a movimentação. Nenhuma outra rota altera `products.stock_quantity` (a coluna nem tem permissão de `UPDATE` para o cliente).
3. **Imutabilidade:** movimentações e itens de venda têm gatilhos que recusam `UPDATE`/`DELETE` (SQLSTATE `SG008`). Correções são novas movimentações.
4. **Idempotência:** operações de escrita recebem uma chave gerada no servidor ao renderizar o formulário; reenvios devolvem o registro já criado (bloqueio por advisory lock + índice único).
5. **Preços no servidor:** `register_sale` recebe apenas produto, quantidade e desconto, e aplica o preço cadastrado ou a melhor promoção ativa.

## Multiempresa e segurança
- Toda tabela de negócio tem `company_id`; chaves estrangeiras compostas `(company_id, id)` impedem referências entre empresas.
- Políticas RLS usam funções auxiliares `SECURITY DEFINER` (`is_company_member`, `has_company_role`).
- Papéis: `owner` (configurações da empresa), `manager` (cancelar vendas), `staff` (operação diária).
- Views usam `security_invoker`, portanto herdam o RLS do usuário.
- `service_role` não é usada. O proxy usa `getClaims()` apenas para redirecionar; as telas usam `getUser()` (validado no servidor de autenticação).

## Códigos de erro de negócio
`SG001` estoque insuficiente · `SG003` produto inativo · `SG004` venda já cancelada · `SG005` dados inválidos · `SG006` não encontrado ·
`SG007` venda vazia · `SG008` registro imutável · `42501` sem permissão. `src/lib/errors.ts` converte esses códigos em mensagens em português.

## Dinheiro e quantidades
Valores em `numeric(14,2)`, quantidades em `numeric(14,3)`. No TypeScript os cálculos usam centavos/milésimos com arredondamento “meio para cima”,
idêntico ao `round()` do PostgreSQL (há teste de paridade). Unidades inteiras (`un`, `cx`, `pct`, `par`) não aceitam fração.

## Precificação
Margem = (preço − custo) ÷ preço. Markup = (preço − custo) ÷ custo. Preço sugerido = custo ÷ (1 − margem). São conceitos diferentes e a tela os exibe separadamente.
Resultados são estimativas (sem impostos, taxas ou despesas).

## Interface
Menu lateral azul-marinho (gaveta no celular), tabelas que viram cartões no celular, confirmação de ações destrutivas na própria página (sem janelas pop-up),
estados de carregamento/erro/vazio/sucesso, sem modo escuro por padrão e sem emojis.
