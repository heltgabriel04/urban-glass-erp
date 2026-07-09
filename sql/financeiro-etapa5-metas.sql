-- ─────────────────────────────────────────────────────────
-- Etapa 5.3 · Metas e Acompanhamento — Dashboard Financeiro
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS metas_financeiras (
  id          serial PRIMARY KEY,
  ano         int NOT NULL,
  mes         int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo        text NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
  valor_meta  numeric(12,2) NOT NULL CHECK (valor_meta > 0),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (ano, mes, tipo)
);

ALTER TABLE metas_financeiras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "metas_financeiras_read"  ON metas_financeiras;
DROP POLICY IF EXISTS "metas_financeiras_write" ON metas_financeiras;
CREATE POLICY "metas_financeiras_read"  ON metas_financeiras FOR SELECT TO authenticated USING (true);
CREATE POLICY "metas_financeiras_write" ON metas_financeiras FOR ALL    TO authenticated USING (true) WITH CHECK (true);
