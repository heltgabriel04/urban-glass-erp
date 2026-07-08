-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote D — Rateio de despesa por Centro de Custo
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lancamento_rateio (
  id              serial PRIMARY KEY,
  lancamento_id   int NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  centro_custo_id int NOT NULL REFERENCES centros_custo(id) ON DELETE RESTRICT,
  percentual      numeric(5,2) NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (lancamento_id, centro_custo_id)
);
CREATE INDEX IF NOT EXISTS idx_lancamento_rateio_lancamento ON lancamento_rateio (lancamento_id);

ALTER TABLE lancamento_rateio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamento_rateio_read"  ON lancamento_rateio;
DROP POLICY IF EXISTS "lancamento_rateio_write" ON lancamento_rateio;
CREATE POLICY "lancamento_rateio_read"  ON lancamento_rateio FOR SELECT TO authenticated USING (true);
CREATE POLICY "lancamento_rateio_write" ON lancamento_rateio FOR ALL    TO authenticated USING (true) WITH CHECK (true);
