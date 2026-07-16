-- ============================================================
-- RBAC: novo papel "comercial_operacional"
--
-- Acesso restrito a Comercial + Operação + Cadastros operacionais
-- (Clientes, Vendedores, Fornecedores, Produtos, Tabelas de Preço).
-- Sem acesso a Dashboard, Financeiro, Contabilidade, Relatórios, nem aos
-- 4 itens de configuração financeira que moram no grupo Cadastros no menu
-- (Bancos & Caixa, Formas de Pagamento, Plano de Contas, Metas Financeiras).
-- A restrição principal é de navegação (middleware.ts). Mas duas políticas
-- de RLS já existentes travam mais do que isso:
--   • sql/seguranca-05-restringe-select-financeiro.sql — SELECT de 40
--     tabelas restrito a admin/financeiro.
--   • scripts/migration-rls-roles.sql — INSERT/UPDATE/DELETE restrito a
--     admin em ('clientes','produtos','orcamentos','itens_orcamento',
--     'tabelas_preco','tabela_preco_itens', + tabelas financeiras).
-- 6 dessas tabelas (clientes, produtos, orcamentos, itens_orcamento,
-- tabelas_preco, tabela_preco_itens) são as próprias telas de
-- Comercial/Cadastros que este papel precisa operar normalmente (criar
-- orçamento, cadastrar cliente, editar tabela de preço) — não só ler.
-- As policies abaixo são aditivas (permissive, OR) e cobrem só essas 6
-- tabelas — não tocam na proteção das outras 34 tabelas financeiras.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'producao', 'visitante', 'financeiro', 'comercial_operacional'));

do $$
declare
  t text;
  tabelas_liberadas text[] := array[
    'clientes', 'produtos', 'orcamentos', 'itens_orcamento',
    'tabelas_preco', 'tabela_preco_itens'
  ];
begin
  foreach t in array tabelas_liberadas loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('drop policy if exists "select_comercial_operacional" on public.%I;', t);
      execute format($p$
        create policy "select_comercial_operacional" on public.%I
          for select to authenticated
          using ((auth.jwt() ->> 'user_role') = 'comercial_operacional');
      $p$, t);

      execute format('drop policy if exists "write_comercial_operacional" on public.%I;', t);
      execute format($p$
        create policy "write_comercial_operacional" on public.%I
          for all to authenticated
          using ((auth.jwt() ->> 'user_role') = 'comercial_operacional')
          with check ((auth.jwt() ->> 'user_role') = 'comercial_operacional');
      $p$, t);
    end if;
  end loop;
end $$;

-- Atribui o papel à conta já criada (busca o id pelo e-mail em auth.users).
insert into public.user_roles (user_id, role)
select id, 'comercial_operacional'
from auth.users
where email = 'costavidalempreendimentos2@gmail.com'
on conflict (user_id) do update set role = excluded.role;

-- ⚠️ O papel só passa a valer em tokens NOVOS: a pessoa precisa
--    fazer login (ou refazer login, se já tiver sessão aberta).

-- ── Verificação ─────────────────────────────────────────────
-- select u.email, r.role
--   from public.user_roles r
--   join auth.users u on u.id = r.user_id
--  where u.email = 'costavidalempreendimentos2@gmail.com';
