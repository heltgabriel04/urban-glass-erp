-- ─────────────────────────────────────────────────────────
-- FASE 2 (parte 1) · Fundação financeira + Baixa Parcial
-- Contas Bancárias, Centro de Custo, Baixas de Lançamento
-- Rodar no SQL Editor do Supabase
-- ─────────────────────────────────────────────────────────

-- 1. Contas Bancárias / Caixa
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id             serial PRIMARY KEY,
  nome           text NOT NULL,
  banco          text,
  tipo           text NOT NULL DEFAULT 'Banco' CHECK (tipo IN ('Caixa', 'Banco', 'Aplicação')),
  saldo_inicial  numeric(14,2) NOT NULL DEFAULT 0,
  ativo          boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contas_bancarias_read"  ON contas_bancarias;
DROP POLICY IF EXISTS "contas_bancarias_write" ON contas_bancarias;
CREATE POLICY "contas_bancarias_read"  ON contas_bancarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "contas_bancarias_write" ON contas_bancarias FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 2. Centro de Custo
CREATE TABLE IF NOT EXISTS centros_custo (
  id          serial PRIMARY KEY,
  nome        text NOT NULL,
  ativo       boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "centros_custo_read"  ON centros_custo;
DROP POLICY IF EXISTS "centros_custo_write" ON centros_custo;
CREATE POLICY "centros_custo_read"  ON centros_custo FOR SELECT TO authenticated USING (true);
CREATE POLICY "centros_custo_write" ON centros_custo FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 3. Lançamentos ganham referência opcional a conta bancária e centro de custo
--    (as colunas texto `conta` e `categoria` continuam existindo, sem uso novo)
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS conta_id        int REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS centro_custo_id int REFERENCES centros_custo(id)    ON DELETE SET NULL;

-- 4. Baixas de lançamento (histórico de pagamento/recebimento, suporta parcial + estorno)
CREATE TABLE IF NOT EXISTS baixas_lancamento (
  id                serial PRIMARY KEY,
  lancamento_id     int NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  valor             numeric(14,2) NOT NULL CHECK (valor > 0),
  data              date NOT NULL,
  conta_id          int REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  forma_pgto        text,
  obs               text,
  estornado_em      timestamptz,
  estornado_motivo  text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_baixas_lancamento ON baixas_lancamento(lancamento_id);

ALTER TABLE baixas_lancamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "baixas_lancamento_read"  ON baixas_lancamento;
DROP POLICY IF EXISTS "baixas_lancamento_write" ON baixas_lancamento;
CREATE POLICY "baixas_lancamento_read"  ON baixas_lancamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "baixas_lancamento_write" ON baixas_lancamento FOR ALL    TO authenticated USING (true) WITH CHECK (true);
