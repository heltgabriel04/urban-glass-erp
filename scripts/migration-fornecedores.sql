-- ============================================================
-- Módulo Fornecedores — cadastro ausente apontado na auditoria.
-- Rodar no SQL Editor do Supabase.
-- ============================================================
create table if not exists public.fornecedores (
  id          bigint generated always as identity primary key,
  nome        text not null,
  cnpj        text default '',
  tel         text default '',
  email       text default '',
  contato     text default '',
  cidade      text default '',
  uf          text default '',
  categoria   text default '',
  obs         text default '',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- RLS: leitura para autenticados, escrita só admin (dado mestre).
alter table public.fornecedores enable row level security;

drop policy if exists "auth_read" on public.fornecedores;
create policy "auth_read" on public.fornecedores
  for select to authenticated using (true);

drop policy if exists "admin_write" on public.fornecedores;
create policy "admin_write" on public.fornecedores
  for all to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin')
  with check ((auth.jwt() ->> 'user_role') = 'admin');
