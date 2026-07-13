# RLS SELECT Restrito

**Origem**: item "RLS SELECT liberado geral" do backlog da auditoria geral do ERP (2026-07-10, ver memória `project-auditoria-erp-completa`). Sub-projeto 3 de 4 de uma leva combinada com o usuário (Fornecedor → Modal → RLS → Fiscal).

## Problema

`scripts/migration-rls-roles.sql:46-49` (e o mesmo padrão replicado em ~25 outros arquivos SQL) dá SELECT liberado a **qualquer usuário autenticado**, de qualquer perfil (`admin`, `financeiro`, `producao`, `visitante`), em praticamente todo o módulo financeiro/contábil. O array `tabelas_admin` já restringe a ESCRITA (INSERT/UPDATE/DELETE) a `admin`, mas a LEITURA ficou deliberadamente aberta (comentário no próprio arquivo, linhas 5-10) — inclusive há um bloco já **comentado** no fim do arquivo (linhas 63-87) prevendo essa restrição futura, nunca aplicado.

Existem 4 perfis (`lib/auth/role.ts`): `admin`, `producao`, `financeiro`, `visitante` (fallback quando não há claim válido). `visitante` é hoje usado por 2 contas externas de confiança, mas estruturalmente é também o fallback de qualquer falha de configuração — deixar dados financeiros abertos pra esse perfil é o risco real.

## Levantamento (evidência de código, não suposição)

- **Perfil `producao`**: `middleware.ts:86-93` restringe esse perfil a UMA rota só, `/pedidos/[id]/producao`. Essa tela usa `getPedidoById` (`services/pedidos.service.ts:107-116`), que faz um embed `clientes(*)` e `produtos(id,unidade)`. **Mas só `pedido.clientes?.nome` é de fato renderizado na tela** (`app/pedidos/[id]/producao/page.tsx:150`) — o campo `produtos` do item é buscado e nunca usado no JSX (confirmado por grep, zero ocorrências de `.produtos`/`unidade` no arquivo). Ou seja, restringir `clientes` quebra a exibição do nome do cliente nessa tela; restringir `produtos` não quebra nada (dado morto).
- **Perfil `visitante`**: sem rota exclusiva no middleware — acessa qualquer rota de página sem `requireRole` mais restritivo. 3 rotas de API (`gerar-romaneio`, `dashboard-financeiro/relatorio-pdf`, `lancamentos/baixas/[id]/gerar-comprovante`) já usam `SUPABASE_SERVICE_ROLE_KEY` e bypassam RLS por completo — essas continuam fora do alcance desta mudança (não é regressão nem correção, é escopo separado, já pré-existente).
- **Nomes de policy de SELECT hoje** seguem 2 padrões no repo: `"auth_select"`/`"auth_read"` (guardado com `IF NOT EXISTS ... pg_policies`) e `"<tabela>_read"` (direto, sem guard) — confirmado por grep em `sql/*.sql` e `scripts/*.sql`.
- **RPC `security definer`** existente (`delete_pedido_cascade`, `sql/seguranca-02-deletar-pedido-atomico.sql`) só escreve, não faz SELECT que devolva linhas de `lancamentos`/`notas_fiscais` ao chamador — não é uma via alternativa de leitura hoje.

## Decisões (confirmadas com o usuário)

- Varredura completa das ~40 tabelas do módulo financeiro/contábil (não só as 13 do achado original) — ver lista completa abaixo.
- `filtros_salvos` **excluído** — é preferência de UI (nome de filtro salvo em Contas a Pagar/Receber), não dado financeiro.
- SELECT restrito a `(auth.jwt()->>'user_role') IN ('admin','financeiro')` — `producao` e `visitante` perdem leitura direta dessas tabelas via RLS.
- Tela de produção ganha uma RPC minúscula (`get_cliente_nome_publico`) só pra continuar mostrando o nome do cliente, sem reabrir a tabela `clientes` inteira pro perfil `producao`.

## Tabelas em escopo (40)

**Achado original (13)**: `lancamentos`, `financeiro`, `notas_fiscais`, `config_fiscal_produtos`, `config_fiscal_padrao`, `tabelas_preco`, `tabela_preco_itens`, `investimentos`, `inv_opcoes`, `clientes`, `produtos`, `orcamentos`, `itens_orcamento`

**Financeiro (13)**: `contas_bancarias`, `centros_custo`, `baixas_lancamento`, `lancamentos_recorrentes`, `extratos_importados`, `extrato_linhas`, `lancamentos_historico`, `transferencias_bancarias`, `lancamento_rateio`, `formas_pagamento`, `metas_financeiras`, `pc_categorias`, `plano_contas`

**Contabilidade (14)**: `cartoes`, `cartoes_faturas`, `cartoes_lancamentos`, `emprestimos`, `emprestimos_parcelas`, `consorcios`, `consorcios_parcelas`, `consorcios_lances`, `ativos_imobilizados`, `itens_estoque_gerais`, `itens_estoque_movimentacoes`, `documentos_fiscais`, `contabilidade_fechamentos`, `contabilidade_checklist_itens`

## Migration SQL

Um arquivo novo, `sql/seguranca-05-restringe-select-financeiro.sql`, seguindo o mesmo padrão de loop já usado em `scripts/migration-rls-roles.sql:18-52`:

```sql
do $$
declare
  t text;
  tabelas_financeiras text[] := array[
    'lancamentos','financeiro','notas_fiscais',
    'config_fiscal_produtos','config_fiscal_padrao',
    'tabelas_preco','tabela_preco_itens',
    'investimentos','inv_opcoes','clientes','produtos',
    'orcamentos','itens_orcamento',
    'contas_bancarias','centros_custo','baixas_lancamento',
    'lancamentos_recorrentes','extratos_importados','extrato_linhas',
    'lancamentos_historico','transferencias_bancarias','lancamento_rateio',
    'formas_pagamento','metas_financeiras','pc_categorias','plano_contas',
    'cartoes','cartoes_faturas','cartoes_lancamentos',
    'emprestimos','emprestimos_parcelas',
    'consorcios','consorcios_parcelas','consorcios_lances',
    'ativos_imobilizados','itens_estoque_gerais','itens_estoque_movimentacoes',
    'documentos_fiscais','contabilidade_fechamentos','contabilidade_checklist_itens'
  ];
begin
  foreach t in array tabelas_financeiras loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      execute format('drop policy if exists "auth_read" on public.%I;', t);
      execute format('drop policy if exists "auth_select" on public.%I;', t);
      execute format('drop policy if exists "%s_read" on public.%I;', t, t);
      execute format($p$
        create policy "select_admin_financeiro" on public.%I
          for select to authenticated
          using ((auth.jwt() ->> 'user_role') in ('admin','financeiro'));
      $p$, t);
    end if;
  end loop;
end $$;
```

Não toca em nenhuma policy de escrita. Idempotente (`drop ... if exists` + recriação determinística).

## RPC + ajuste da tela de produção

```sql
create or replace function get_cliente_nome_publico(p_cliente_id integer)
returns text
language sql
security definer
set search_path = public
as $$
  select nome from clientes where id = p_cliente_id;
$$;

revoke all on function get_cliente_nome_publico(integer) from public, anon;
grant execute on function get_cliente_nome_publico(integer) to authenticated;
```

`services/pedidos.service.ts` ganha `getClienteNomePublico(clienteId)` chamando `supabase.rpc('get_cliente_nome_publico', { p_cliente_id: clienteId })`. `app/pedidos/[id]/producao/page.tsx` passa a usar esse valor no lugar de `pedido.clientes?.nome` — precisa de `pedido.cliente_id` (já vem no select de `getPedidoById`, que não muda).

## Fora de escopo

- `filtros_salvos` — excluído por decisão do usuário.
- Tabelas operacionais (`pedidos`, `itens_pedido`, `programacao_*`, `estoque`, `retalhos`, `compras`, `qualidade_*`, `fornecedores`, `log_atividades`, `checklist_expedicao`) — fora do achado, não tocadas.
- As 3 rotas de API que já usam `SUPABASE_SERVICE_ROLE_KEY` (bypassam RLS) — pré-existente, não é regressão nem parte deste achado.
- Multi-tenant, migrations sem versionamento — outros achados da auditoria, não relacionados.

## Teste

Sem framework de teste automatizado nem service role key local (mesma limitação dos sub-projetos 1 e 2). Validação via:
- `tsc --noEmit` + `next build` limpos após o ajuste da tela de produção.
- Usuário roda a migration no Supabase e testa manualmente: (1) logado como `producao`, abrir `/pedidos/[id]/producao` e confirmar que o nome do cliente aparece; (2) logado como `admin`/`financeiro`, confirmar que as telas financeiras/contábeis continuam funcionando normalmente; (3) se tiver como testar com um usuário `visitante`, confirmar que essas telas ficam vazias/bloqueadas.
