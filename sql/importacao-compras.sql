-- ============================================================
-- Custo de Importação por Lote — colunas novas em compras
-- Uma compra = um lote/DI. Tributos digitados da DI em R$.
-- Ver docs/superpowers/specs/2026-07-17-custo-importacao-design.md
--
-- Rodar no SQL Editor do Supabase ANTES de usar a seção
-- "Importação" na tela de Compras (o save com o checkbox marcado
-- depende dessas colunas existirem).
-- ============================================================

alter table public.compras
  add column if not exists eh_importacao             boolean not null default false,
  add column if not exists numero_di                 text,
  add column if not exists valor_fob_usd             numeric not null default 0,
  add column if not exists frete_internacional_usd   numeric not null default 0,
  add column if not exists seguro_internacional_usd  numeric not null default 0,
  add column if not exists cambio_usd                numeric not null default 0,
  add column if not exists ii                        numeric not null default 0,
  add column if not exists ipi_importacao            numeric not null default 0,
  add column if not exists pis_cofins_importacao     numeric not null default 0,
  add column if not exists icms_importacao           numeric not null default 0,
  add column if not exists despesas_aduaneiras       numeric not null default 0,
  add column if not exists ipi_creditavel            boolean not null default false,
  add column if not exists pis_cofins_creditavel     boolean not null default true,
  add column if not exists icms_creditavel           boolean not null default true;

-- ── Verificação ─────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='compras'
--    and column_name in ('eh_importacao','cambio_usd','ii','despesas_aduaneiras');
