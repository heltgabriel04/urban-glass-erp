-- ============================================================
-- IPI nos Orçamentos — 6,5% fixo, opcional por orçamento
-- Mesmo padrão de sql/ipi-pedidos.sql. Ao aprovar um orçamento em
-- pedido (aprovarOrcamento em services/orcamentos.service.ts), tem_ipi
-- e valor_ipi são copiados para o pedido gerado.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.orcamentos
  add column if not exists tem_ipi boolean not null default false,
  add column if not exists valor_ipi numeric not null default 0;

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='orcamentos' and column_name in ('tem_ipi','valor_ipi');
