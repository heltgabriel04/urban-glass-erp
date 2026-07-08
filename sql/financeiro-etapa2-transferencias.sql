-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote C — Transferências entre contas
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transferencias_bancarias (
  id               serial PRIMARY KEY,
  conta_origem_id  int NOT NULL REFERENCES contas_bancarias(id) ON DELETE RESTRICT,
  conta_destino_id int NOT NULL REFERENCES contas_bancarias(id) ON DELETE RESTRICT,
  valor            numeric(14,2) NOT NULL CHECK (valor > 0),
  data             date NOT NULL,
  obs              text,
  created_at       timestamptz DEFAULT now(),
  CHECK (conta_origem_id <> conta_destino_id)
);

ALTER TABLE transferencias_bancarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transferencias_read"  ON transferencias_bancarias;
DROP POLICY IF EXISTS "transferencias_write" ON transferencias_bancarias;
CREATE POLICY "transferencias_read"  ON transferencias_bancarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "transferencias_write" ON transferencias_bancarias FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- baixas_lancamento passa a poder existir sem lançamento (baixa-espelho de
-- uma transferência) — exatamente um dos dois (lancamento_id / transferencia_id)
-- precisa estar preenchido.
ALTER TABLE baixas_lancamento ALTER COLUMN lancamento_id DROP NOT NULL;
ALTER TABLE baixas_lancamento ADD COLUMN IF NOT EXISTS transferencia_id int REFERENCES transferencias_bancarias(id) ON DELETE CASCADE;
ALTER TABLE baixas_lancamento DROP CONSTRAINT IF EXISTS baixas_lancamento_origem_check;
ALTER TABLE baixas_lancamento ADD CONSTRAINT baixas_lancamento_origem_check
  CHECK ((lancamento_id IS NOT NULL AND transferencia_id IS NULL) OR (lancamento_id IS NULL AND transferencia_id IS NOT NULL));
