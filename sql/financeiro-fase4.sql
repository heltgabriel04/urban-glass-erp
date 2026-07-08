-- ─────────────────────────────────────────────────────────
-- FASE 4 · Automação — Lançamentos Recorrentes
-- Rodar no SQL Editor do Supabase
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lancamentos_recorrentes (
  id                serial PRIMARY KEY,
  tipo              text NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
  descricao         text NOT NULL,
  valor             numeric(14,2) NOT NULL CHECK (valor > 0),
  dia_vencimento    int NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  plano_contas_id   int REFERENCES plano_contas(id) ON DELETE SET NULL,
  centro_custo_id   int REFERENCES centros_custo(id) ON DELETE SET NULL,
  conta_id          int REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  fornecedor        text,
  cliente_id        int REFERENCES clientes(id) ON DELETE SET NULL,
  ativo             boolean DEFAULT true,
  gerado_ate        date,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE lancamentos_recorrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamentos_recorrentes_read"  ON lancamentos_recorrentes;
DROP POLICY IF EXISTS "lancamentos_recorrentes_write" ON lancamentos_recorrentes;
CREATE POLICY "lancamentos_recorrentes_read"  ON lancamentos_recorrentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "lancamentos_recorrentes_write" ON lancamentos_recorrentes FOR ALL    TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS recorrencia_id int REFERENCES lancamentos_recorrentes(id) ON DELETE SET NULL;
