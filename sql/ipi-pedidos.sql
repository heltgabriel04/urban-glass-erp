-- ============================================================
-- IPI nos Pedidos — 6,5% fixo, opcional por pedido
-- Ver docs/superpowers/specs/2026-07-16-ipi-pedidos-design.md
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.pedidos
  add column if not exists tem_ipi boolean not null default false,
  add column if not exists valor_ipi numeric not null default 0;

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='pedidos' and column_name in ('tem_ipi','valor_ipi');
