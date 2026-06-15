-- ============================================================
-- Item 5 — Habilitar RLS (Row Level Security)
-- A chave anônima fica EXPOSTA no navegador; sem RLS, qualquer pessoa
-- com essa chave tem acesso total ao banco. Este script estabelece um
-- baseline seguro: somente usuários AUTENTICADOS leem/escrevem.
--
-- ⚠️ Rode primeiro o DIAGNÓSTICO, confira o resultado, depois aplique.
-- ⚠️ Depois de aplicado, ENDUREÇA por perfil (ver seção final).
-- ============================================================

-- ── DIAGNÓSTICO: quais tabelas estão SEM RLS? ──────────────
-- select tablename, rowsecurity
--   from pg_tables
--  where schemaname = 'public'
--  order by rowsecurity, tablename;

-- ── BASELINE: habilita RLS + policy "somente autenticado" ──
-- Repita o bloco para cada tabela de negócio. Ajuste a lista conforme
-- as tabelas realmente existentes no seu projeto.
do $$
declare
  t text;
  tabelas text[] := array[
    'clientes','produtos','pedidos','itens_pedido','estoque',
    'retalhos','retalhos_uso','orcamentos','lancamentos',
    'historico_otimizador','otimizacoes','tabelas_preco','tabela_preco_itens',
    'notas_fiscais','config_fiscal_produtos','config_fiscal_padrao',
    'checklist_expedicao','investimentos','inv_opcoes'
    -- 'log_atividades' é acessado só via service_role (API), pode ficar de fora
  ];
begin
  foreach t in array tabelas loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      execute format('alter table public.%I enable row level security;', t);

      execute format($p$
        drop policy if exists "auth_read" on public.%I;
        create policy "auth_read" on public.%I
          for select using (auth.role() = 'authenticated');
      $p$, t, t);

      execute format($p$
        drop policy if exists "auth_write" on public.%I;
        create policy "auth_write" on public.%I
          for all
          using (auth.role() = 'authenticated')
          with check (auth.role() = 'authenticated');
      $p$, t, t);
    end if;
  end loop;
end $$;

-- ── VERIFICAÇÃO ────────────────────────────────────────────
-- Com a sessão deslogada (anon), uma query como
--   select * from pedidos;
-- deve retornar VAZIO/negado. Logado, deve funcionar normalmente.

-- ============================================================
-- PRÓXIMO PASSO (endurecer por perfil — fazer depois, com calma):
--   • log_atividades: SELECT só para admin.
--   • lancamentos / financeiro: escrita bloqueada para 'producao'.
--   • config_fiscal_*: escrita só admin.
-- Exemplo de policy por perfil (claim user_role no JWT):
--   create policy "admin_only_write" on public.config_fiscal_padrao
--     for all
--     using  ((auth.jwt() ->> 'user_role') = 'admin')
--     with check ((auth.jwt() ->> 'user_role') = 'admin');
-- ============================================================
