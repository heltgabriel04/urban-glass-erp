-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote F — Bloqueio de crédito
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueado_credito boolean NOT NULL DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bloqueado_credito_em timestamptz;
