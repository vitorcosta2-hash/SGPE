# SGPE — Sistema de Gerenciamento Web para Pequenas Empresas

Sistema web de controle de estoque, vendas, precificação, promoções e relatórios para pequenas empresas.
Projeto de conclusão do curso técnico em Informática (IFMS). O foco principal é o **controle de estoque**:
todo saldo é alterado somente por movimentações registradas, imutáveis e atômicas.

## Funcionalidades

| Módulo | O que faz |
| --- | --- |
| Início | Indicadores calculados do banco (produtos, valor em estoque, estoque baixo, vendas do dia), lista de reposição e últimas movimentações. Estado de boas-vindas quando a empresa está vazia. |
| Produtos e estoque | CRUD com SKU e código de barras únicos por empresa, categoria, unidade, custo, preço, estoque mínimo, ativo/inativo, busca, filtros, ordenação e paginação. Produto com histórico não é excluído: é desativado. |
| Categorias | CRUD com contagem de produtos; exclusão bloqueada enquanto houver produtos. |
| Movimentações | Entrada, saída manual, ajuste positivo/negativo, contagem de inventário, saída por venda e estorno. Cada registro guarda saldo anterior/posterior, usuário, motivo e venda de origem. Nunca fica negativo. |
| Vendas | PDV com busca por nome/SKU/código de barras, cliente opcional, formas de pagamento (dinheiro, Pix, crédito, débito, outro), desconto por item, comprovante imprimível e cancelamento com estorno (apenas proprietário/gerente, sem cancelar duas vezes). Preços e totais são calculados no banco. |
| Clientes | Cadastro simples (nome, telefone, e-mail, observações). |
| Precificação | Preço sugerido por margem, diferença entre **margem** e **markup**, simulação de desconto com alertas (abaixo do custo / da margem mínima) e aplicação do preço ao produto **somente após confirmação**. Os valores são estimativas. |
| Promoções | Desconto percentual, em reais ou preço fixo por período, em produtos selecionados. Situação agendada/ativa/encerrada calculada pelo fuso da empresa; encerramento manual; o preço base nunca é alterado; arte PNG opcional gerada no navegador. |
| Relatórios | Estoque, movimentações e vendas, com filtro de período e exportação CSV (separador `;`, UTF-8 com BOM, proteção contra injeção de fórmulas). O faturamento é chamado de **faturamento bruto**, nunca de lucro. |
| Configurações | Dados da empresa, fuso horário, estoque mínimo padrão, margem mínima e nome do usuário. |
| Autenticação | Cadastro, login, logout, recuperação e redefinição de senha, sessão persistente, rotas protegidas. |

## Tecnologias

- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4
- Supabase: Auth + PostgreSQL com RLS (`@supabase/ssr`, `@supabase/supabase-js`)
- zod (validação), lucide-react (ícones), `@fontsource-variable/inter` (fonte local)
- Testes: vitest e PostgreSQL real descartável (pacote `pg`)

## Estrutura de pastas

```
src/
  app/            rotas (auth: entrar, cadastro…; (app): telas do sistema; api/ e relatorios/exportar)
  components/     ui/ (botões, campos, tabela, confirmação inline) e layout/ (menu lateral)
  features/       um módulo por área: schemas (zod), actions (Server Actions), queries, components
  lib/            domain/ (dinheiro, estoque, preço, promoções, datas), supabase/, auth/, csv, erros
  proxy.ts        renovação de sessão e proteção de rotas
supabase/
  migrations/     5 migrações versionadas (esquema, segurança/RLS, funções, views/relatórios, gatilho de cadastro)
  tests/          shim de testes (NÃO usar no Supabase real)
tests/            unit/ (regras puras e validação) e db/ (banco real: estoque, vendas, promoções, isolamento)
docs/             ARQUITETURA.md
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com os dados do **seu** projeto Supabase.

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | chave pública; o acesso é limitado pelo RLS |
| `NEXT_PUBLIC_SITE_URL` | endereço do site, usado nos links de e-mail |

A chave `service_role` **não é usada** em nenhum ponto do sistema e jamais deve ser colocada em variável `NEXT_PUBLIC_*`.
Sem as variáveis, o sistema mostra a página “Configuração pendente” em vez de falhar.

## Como configurar do zero

1. Crie um projeto no [Supabase](https://supabase.com).
2. Aplique as migrações **na ordem** (SQL Editor ou `supabase db push`):
   `20261021120100_schema.sql`, `…0200_security.sql`, `…0300_functions.sql`, `…0400_views_reports.sql`, `…0500_auth_hooks.sql`.
3. Em *Authentication › URL Configuration*: defina **Site URL** (`NEXT_PUBLIC_SITE_URL`) e adicione em *Redirect URLs*
   `<site>/auth/confirmar`.
4. Em *Authentication › Email Templates*, faça os links usarem o fluxo com `token_hash`
   (ex.: `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email` para confirmação e `type=recovery` para recuperação de senha).
5. Preencha `.env.local` e rode o sistema. O primeiro cadastro cria o perfil, a empresa (da qual a pessoa é proprietária) e a categoria padrão “Geral”.

## Comandos

```bash
npm install
npm run dev          # desenvolvimento em http://localhost:3000
npm run lint
npm run typecheck
npm run test:unit    # não precisa de banco
npm run test:db      # precisa de PostgreSQL local (veja abaixo)
npm run build && npm start
npm run check        # lint + typecheck + testes + build
```

### Testes com banco

Os testes de `tests/db` criam bancos PostgreSQL **temporários** (`sgpe_test_*`), aplicam as migrações reais e os apagam ao final.
Defina `TEST_DATABASE_ADMIN_URL` (padrão: `postgres://sgpe_test:sgpe_test@localhost:5432/postgres`) apontando para um PostgreSQL **local**
com um usuário que possa criar bancos. **Nunca aponte para um banco de produção.** Sem banco disponível, esses testes são ignorados.

Cobertura: entrada/saída/ajuste, saldo negativo bloqueado, saída concorrente (sem saldo negativo), idempotência, imutabilidade das movimentações,
venda com preço calculado no servidor, venda com estoque insuficiente (nada é gravado), cancelamento com estorno e bloqueio de duplo cancelamento,
promoções (período, melhor preço, encerramento), relatórios, isolamento entre empresas (RLS) para todas as tabelas e funções, restrições por papel,
paridade entre as regras de dinheiro/preço em TypeScript e SQL e validação dos formulários.

## Limitações e pontos de atenção

- **Integração com um Supabase real não foi exercitada de ponta a ponta** neste ambiente (sem Docker/Supabase). A camada de banco foi testada
  em PostgreSQL real; as telas foram verificadas por tipagem, lint, build de produção e testes de rotas públicas/protegidas. Recomenda-se um teste manual
  completo logo após criar o projeto Supabase (cadastro → produto → entrada → venda → cancelamento → relatório).
- Uma empresa por usuário na interface (o modelo de dados já suporta várias).
- `npm audit` aponta vulnerabilidades de severidade alta apenas na cadeia de desenvolvimento do ESLint (`eslint-config-next`); não afetam o código em produção.
- Listas de seleção (produtos em movimentações/promoções) carregam até 1000 itens; o PDV usa busca remota.
- CSV exporta até 50.000 linhas por arquivo.
- Senha: mínimo de 8 caracteres (ajuste a política em *Authentication* no painel do Supabase).

## Segurança

RLS em todas as tabelas; permissões por coluna (o saldo de estoque não é gravável pelo cliente); funções `SECURITY DEFINER` com `search_path` fixo;
mensagens internas do banco nunca são exibidas; senhas e tokens não são registrados em log; `next` de redirecionamento é validado.
Mais detalhes em `docs/ARQUITETURA.md`.
