-- ============================================================
-- Controle de Perda de Vidro (m²) — base de dados
-- Une quebras + retalhos + historico_otimizador num relatório mensal
-- de perda por tipo de vidro, sem modelo de chapa física individual.
-- Ver docs/superpowers/specs/2026-07-16-controle-perda-vidro-design.md
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

-- 1. quebras ganha produto_id (hoje só tem produto_nome em texto livre)
alter table public.quebras add column if not exists produto_id int references produtos(id);
create index if not exists idx_quebras_produto on public.quebras (produto_id);

-- 2. Detalhe de perda de otimização por produto, por rodada
create table if not exists public.otimizacao_perda_detalhe (
  id                bigserial primary key,
  pedido_id         text not null references pedidos(id) on delete cascade,
  produto_id        int references produtos(id),
  produto_nome      text not null,
  m2_bruta_chapas   numeric not null default 0,
  m2_pecas          numeric not null default 0,
  m2_retalhos       numeric not null default 0,
  m2_perda          numeric not null default 0,
  custo_m2          numeric,
  dt_otim           date not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_otim_perda_pedido  on public.otimizacao_perda_detalhe (pedido_id);
create index if not exists idx_otim_perda_produto on public.otimizacao_perda_detalhe (produto_id);

alter table public.otimizacao_perda_detalhe enable row level security;

drop policy if exists "auth_full_access" on public.otimizacao_perda_detalhe;
create policy "auth_full_access" on public.otimizacao_perda_detalhe
  for all to authenticated using (true) with check (true);

-- 3. View mensal por tipo de vidro
create or replace view public.vw_perda_mensal_vidro as
with corte_mes as (
  select pedido_id, min(dt_fim_real) as dt_corte
  from programacao_producao
  where etapa = 'Corte' and status = 'Concluído'
  group by pedido_id
),
perda_otim as (
  select
    d.produto_id, d.produto_nome,
    coalesce(date_trunc('month', c.dt_corte), date_trunc('month', d.dt_otim)) as mes_referencia,
    sum(d.m2_perda) as m2_perda_otimizacao,
    sum(d.m2_perda * coalesce(d.custo_m2, 0)) as valor_perda_otimizacao
  from otimizacao_perda_detalhe d
  left join corte_mes c on c.pedido_id = d.pedido_id
  group by d.produto_id, d.produto_nome, 3
),
perda_incidente as (
  select
    q.produto_id, q.produto_nome,
    coalesce(date_trunc('month', c.dt_corte), date_trunc('month', q.dt_quebra)) as mes_referencia,
    sum(q.m2_perdido) as m2_perda_incidente,
    sum(coalesce(q.valor_perda, 0)) as valor_perda_incidente
  from quebras q
  left join corte_mes c on c.pedido_id = q.pedido_id
  group by q.produto_id, q.produto_nome, 3
),
retalho_salvo as (
  select
    r.produto_id, p.nome as produto_nome,
    date_trunc('month', r.dt_gerado) as mes_referencia,
    sum(r.m2) as m2_retalho_salvo
  from retalhos r
  join produtos p on p.id = r.produto_id
  group by r.produto_id, p.nome, 3
)
select
  coalesce(o.produto_id, i.produto_id, s.produto_id)     as produto_id,
  coalesce(o.produto_nome, i.produto_nome, s.produto_nome) as produto_nome,
  coalesce(o.mes_referencia, i.mes_referencia, s.mes_referencia) as mes_referencia,
  coalesce(o.m2_perda_otimizacao, 0)  as m2_perda_otimizacao,
  coalesce(o.valor_perda_otimizacao, 0) as valor_perda_otimizacao,
  coalesce(i.m2_perda_incidente, 0)   as m2_perda_incidente,
  coalesce(i.valor_perda_incidente, 0) as valor_perda_incidente,
  coalesce(o.m2_perda_otimizacao, 0) + coalesce(i.m2_perda_incidente, 0) as m2_perda_total,
  coalesce(o.valor_perda_otimizacao, 0) + coalesce(i.valor_perda_incidente, 0) as valor_perda_total,
  coalesce(s.m2_retalho_salvo, 0)     as m2_retalho_salvo
from perda_otim o
full outer join perda_incidente i
  on i.produto_id is not distinct from o.produto_id and i.mes_referencia = o.mes_referencia
full outer join retalho_salvo s
  on s.produto_id is not distinct from coalesce(o.produto_id, i.produto_id)
 and s.mes_referencia = coalesce(o.mes_referencia, i.mes_referencia);

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='quebras' and column_name='produto_id';
-- select * from public.otimizacao_perda_detalhe limit 1;
-- select * from public.vw_perda_mensal_vidro order by mes_referencia desc limit 20;
