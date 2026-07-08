-- ─────────────────────────────────────────────────────────
-- ETAPA 3 · Compra recebida → conta a pagar automática
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS compra_id text REFERENCES compras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lancamentos_compra_id ON lancamentos (compra_id);
