-- ============================================================
-- Custom Access Token Hook — injeta `user_role` no JWT
-- Necessário para o RBAC (middleware.ts) e os guardas de /api funcionarem.
-- Sem isto, roleFromJwt() trata todos como "visitante".
--
-- Rodar no SQL Editor do Supabase. Depois, ATIVAR o hook no Dashboard
-- (instruções no final) e atribuir papéis aos usuários.
-- ============================================================

-- 1) Tabela de papéis (fonte da verdade) ────────────────────
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null check (role in ('admin', 'producao', 'visitante')),
  updated_at timestamptz not null default now()
);

-- 2) Função do hook ─────────────────────────────────────────
-- Recebe o evento de emissão de token e devolve os claims com user_role.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  v_role    text;
begin
  select role into v_role
    from public.user_roles
   where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  -- Fail-safe: sem papel cadastrado => "visitante" (menor privilégio)
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(v_role, 'visitante')));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- 3) Permissões: só o serviço de Auth pode executar o hook e ler a tabela
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant all on table public.user_roles to supabase_auth_admin;
revoke all on table public.user_roles from authenticated, anon, public;

alter table public.user_roles enable row level security;

drop policy if exists "auth_admin_read_roles" on public.user_roles;
create policy "auth_admin_read_roles" on public.user_roles
  as permissive for select to supabase_auth_admin using (true);

-- (Opcional) permitir que admins gerenciem papéis via app, lendo o claim do JWT:
drop policy if exists "admin_manage_roles" on public.user_roles;
create policy "admin_manage_roles" on public.user_roles
  for all to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin')
  with check ((auth.jwt() ->> 'user_role') = 'admin');

-- ============================================================
-- 4) ATIVAR O HOOK (Dashboard):
--    Authentication → Hooks → "Custom Access Token"
--    → selecionar a função public.custom_access_token_hook → Enable.
--    (Ou, via Supabase CLI, em supabase/config.toml:
--       [auth.hook.custom_access_token]
--       enabled = true
--       uri = "pg-functions://postgres/public/custom_access_token_hook")
--
-- 5) ATRIBUIR PAPÉIS (pegue o UUID em Authentication → Users):
--    insert into public.user_roles (user_id, role)
--    values ('00000000-0000-0000-0000-000000000000', 'admin')
--    on conflict (user_id) do update set role = excluded.role, updated_at = now();
--
-- ⚠️ O papel só passa a valer em tokens NOVOS: o usuário precisa
--    refazer login (ou aguardar o refresh do token).
-- ============================================================
