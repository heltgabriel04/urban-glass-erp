-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote J — Conciliação Bancária
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS extratos_importados (
  id             serial PRIMARY KEY,
  conta_id       int NOT NULL REFERENCES contas_bancarias(id) ON DELETE CASCADE,
  arquivo_nome   text,
  importado_em   timestamptz NOT NULL DEFAULT now(),
  importado_por  text
);

CREATE TABLE IF NOT EXISTS extrato_linhas (
  id                  serial PRIMARY KEY,
  extrato_id          int NOT NULL REFERENCES extratos_importados(id) ON DELETE CASCADE,
  data                date NOT NULL,
  valor               numeric(14,2) NOT NULL CHECK (valor > 0),
  tipo                text NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
  descricao_banco     text,
  conciliado          boolean NOT NULL DEFAULT false,
  baixa_lancamento_id int REFERENCES baixas_lancamento(id) ON DELETE SET NULL,
  ignorado            boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extrato_linhas_extrato ON extrato_linhas (extrato_id);

ALTER TABLE extratos_importados ENABLE ROW LEVEL SECURITY;
ALTER TABLE extrato_linhas      ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "extratos_importados_read"  ON extratos_importados;
DROP POLICY IF EXISTS "extratos_importados_write" ON extratos_importados;
DROP POLICY IF EXISTS "extrato_linhas_read"  ON extrato_linhas;
DROP POLICY IF EXISTS "extrato_linhas_write" ON extrato_linhas;
CREATE POLICY "extratos_importados_read"  ON extratos_importados FOR SELECT TO authenticated USING (true);
CREATE POLICY "extratos_importados_write" ON extratos_importados FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "extrato_linhas_read"  ON extrato_linhas FOR SELECT TO authenticated USING (true);
CREATE POLICY "extrato_linhas_write" ON extrato_linhas FOR ALL    TO authenticated USING (true) WITH CHECK (true);
