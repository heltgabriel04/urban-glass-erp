-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote E — Adiantamento, Reembolso, Devolução
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS natureza text NOT NULL DEFAULT 'normal'
  CHECK (natureza IN ('normal', 'adiantamento', 'reembolso', 'devolucao'));
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS lancamento_origem_id int REFERENCES lancamentos(id) ON DELETE SET NULL;

-- Adiantamento pode não ter vencimento nem plano de contas definidos ainda
-- (só ganham sentido quando aplicado a um título) — por isso não são NOT NULL.
ALTER TABLE baixas_lancamento ADD COLUMN IF NOT EXISTS origem_adiantamento_id int REFERENCES lancamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_natureza ON lancamentos (natureza);
