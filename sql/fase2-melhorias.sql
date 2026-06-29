-- ============================================================
-- Fase 2 — Bloqueios de linha, retrabalho, calibração
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Tabela de bloqueios de linha (manutenções, recessos)
--    linha_id NULL = afeta todas as linhas (recesso geral)
CREATE TABLE IF NOT EXISTS bloqueios_linha (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id    INTEGER       REFERENCES producao_linhas(id) ON DELETE CASCADE,
  dt_inicio   TIMESTAMPTZ   NOT NULL,
  dt_fim      TIMESTAMPTZ   NOT NULL CHECK (dt_fim > dt_inicio),
  motivo      TEXT,
  tipo        TEXT          NOT NULL DEFAULT 'manutencao'
                            CHECK (tipo IN ('manutencao', 'recesso', 'outro')),
  criado_por  TEXT,
  created_at  TIMESTAMPTZ   DEFAULT now()
);

ALTER TABLE bloqueios_linha DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bloqueios_range
  ON bloqueios_linha (linha_id, dt_inicio, dt_fim);

-- 2. Coluna 'obs' em programacao_producao para Retrabalho (se não existir)
ALTER TABLE programacao_producao
  ADD COLUMN IF NOT EXISTS obs TEXT;

-- 3. Verificação final
SELECT 'bloqueios_linha criada' AS status, count(*) AS registros FROM bloqueios_linha;
