-- ============================================================
-- Endurecimento de RLS por perfil (user_role no JWT)
-- Pré-requisito: hook custom_access_token_hook ativo + papéis atribuídos.
--
-- Modelo aplicado:
--   • ESCRITA (insert/update/delete) em tabelas sensíveis  → só admin
--   • LEITURA (select) → qualquer autenticado (não quebra visualização)
--   • Tabelas operacionais (pedidos, itens_pedido, estoque, retalhos,
--     historico_otimizador, checklist_expedicao) ficam inalteradas, para
--     o perfil `producao` continuar operando.
--
-- Como o RLS combina policies permissivas com OR, manter uma policy de
-- SELECT liberada + uma policy FOR ALL restrita a admin resulta em:
--   - SELECT: liberado para autenticado
--   - INSERT/UPDATE/DELETE: somente admin
-- ============================================================

do $$
declare
  t text;
  -- Tabelas em que só admin pode escrever:
  tabelas_admin text[] := array[
    'lancamentos','financeiro','notas_fiscais',
    'config_fiscal_produtos','config_fiscal_padrao',
    'tabelas_preco','tabela_preco_itens',
    'investimentos','inv_opcoes',
    'clientes','produtos','orcamentos','itens_orcamento'
  ];
begin
  foreach t in array tabelas_admin loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      -- remove a escrita liberada do baseline
      execute format('drop policy if exists "auth_write" on public.%I;', t);

      -- escrita só admin
      execute format('drop policy if exists "admin_write" on public.%I;', t);
      execute format($p$
        create policy "admin_write" on public.%I
          for all to authenticated
          using ((auth.jwt() ->> 'user_role') = 'admin')
          with check ((auth.jwt() ->> 'user_role') = 'admin');
      $p$, t);

      -- leitura para qualquer autenticado
      execute format('drop policy if exists "auth_read" on public.%I;', t);
      execute format($p$
        create policy "auth_read" on public.%I
          for select to authenticated using (true);
      $p$, t);
    end if;
  end loop;
end $$;

-- ── VERIFICAÇÃO ────────────────────────────────────────────
-- Liste as policies por tabela para conferir:
--   select tablename, policyname, cmd
--     from pg_policies where schemaname='public'
--    order by tablename, policyname;
--
-- Teste prático: logado como 'producao' ou 'visitante', tente editar um
-- lançamento → deve falhar; admin → funciona. Leitura deve funcionar p/ todos.

-- ============================================================
-- OPCIONAL — restringir também a LEITURA das tabelas mais sensíveis
-- (financeiro, fiscal, investimentos) apenas a admin. Descomente se
-- visitante/producao NÃO devem nem visualizar esses dados:
--
-- do $$
-- declare t text;
--   tabelas_admin_read text[] := array[
--     'lancamentos','financeiro','notas_fiscais',
--     'config_fiscal_produtos','config_fiscal_padrao',
--     'investimentos','inv_opcoes'
--   ];
-- begin
--   foreach t in array tabelas_admin_read loop
--     if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
--       execute format('drop policy if exists "auth_read" on public.%I;', t);
--       execute format($p$
--         create policy "admin_read" on public.%I
--           for select to authenticated
--           using ((auth.jwt() ->> 'user_role') = 'admin');
--       $p$, t);
--     end if;
--   end loop;
-- end $$;
-- ============================================================
