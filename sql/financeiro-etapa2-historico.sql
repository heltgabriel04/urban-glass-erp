-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote H — Histórico de versão de lançamento
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lancamentos_historico (
  id             serial PRIMARY KEY,
  lancamento_id  int NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  snapshot       jsonb NOT NULL,
  alterado_em    timestamptz NOT NULL DEFAULT now(),
  alterado_por   text
);
CREATE INDEX IF NOT EXISTS idx_lancamentos_historico_lancamento ON lancamentos_historico (lancamento_id);

ALTER TABLE lancamentos_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamentos_historico_read"  ON lancamentos_historico;
DROP POLICY IF EXISTS "lancamentos_historico_write" ON lancamentos_historico;
CREATE POLICY "lancamentos_historico_read"  ON lancamentos_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "lancamentos_historico_write" ON lancamentos_historico FOR ALL    TO authenticated USING (true) WITH CHECK (true);
