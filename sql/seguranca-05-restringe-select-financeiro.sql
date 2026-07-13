-- Restringe SELECT de 40 tabelas do módulo financeiro/contábil a
-- admin+financeiro (achado "RLS SELECT liberado geral" da auditoria).
-- Não mexe em nenhuma policy de escrita. Idempotente.

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

-- ── VERIFICAÇÃO ────────────────────────────────────────────
-- select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and policyname = 'select_admin_financeiro'
--   order by tablename;
-- Deve listar as 40 tabelas (ou menos, se alguma ainda não existir no banco).
