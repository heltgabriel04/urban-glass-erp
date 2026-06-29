-- ============================================================
-- Fase 1 — Estabilidade: calendário, constraint, índice
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Extensão para constraint de não-sobreposição (requer superuser)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Calendário de dias não úteis (feriados nacionais + bloqueios manuais)
CREATE TABLE IF NOT EXISTS calendario_producao (
  data        DATE    PRIMARY KEY,
  tipo        TEXT    NOT NULL DEFAULT 'feriado'
                      CHECK (tipo IN ('feriado', 'recesso', 'manutencao', 'outro')),
  descricao   TEXT,
  criado_por  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE calendario_producao DISABLE ROW LEVEL SECURITY;

-- Feriados nacionais 2025 e 2026
INSERT INTO calendario_producao (data, tipo, descricao) VALUES
  ('2025-01-01', 'feriado', 'Confraternização Universal'),
  ('2025-03-03', 'feriado', 'Carnaval'),
  ('2025-03-04', 'feriado', 'Carnaval'),
  ('2025-04-18', 'feriado', 'Sexta-Feira Santa'),
  ('2025-04-21', 'feriado', 'Tiradentes'),
  ('2025-05-01', 'feriado', 'Dia do Trabalho'),
  ('2025-06-19', 'feriado', 'Corpus Christi'),
  ('2025-09-07', 'feriado', 'Independência do Brasil'),
  ('2025-10-12', 'feriado', 'Nossa Sra. Aparecida'),
  ('2025-11-02', 'feriado', 'Finados'),
  ('2025-11-15', 'feriado', 'Proclamação da República'),
  ('2025-12-25', 'feriado', 'Natal'),
  ('2026-01-01', 'feriado', 'Confraternização Universal'),
  ('2026-02-16', 'feriado', 'Carnaval'),
  ('2026-02-17', 'feriado', 'Carnaval'),
  ('2026-04-03', 'feriado', 'Sexta-Feira Santa'),
  ('2026-04-21', 'feriado', 'Tiradentes'),
  ('2026-05-01', 'feriado', 'Dia do Trabalho'),
  ('2026-06-04', 'feriado', 'Corpus Christi'),
  ('2026-09-07', 'feriado', 'Independência do Brasil'),
  ('2026-10-12', 'feriado', 'Nossa Sra. Aparecida'),
  ('2026-11-02', 'feriado', 'Finados'),
  ('2026-11-15', 'feriado', 'Proclamação da República'),
  ('2026-12-25', 'feriado', 'Natal')
ON CONFLICT DO NOTHING;

-- 3. Constraint de não-sobreposição por linha (evita race condition)
--    Remove se já existir para recriar corretamente
ALTER TABLE programacao_producao
  DROP CONSTRAINT IF EXISTS no_overlap_linha;

ALTER TABLE programacao_producao
  ADD CONSTRAINT no_overlap_linha
  EXCLUDE USING gist (
    linha_id WITH =,
    tstzrange(dt_inicio_previsto, dt_fim_previsto, '[)') WITH &&
  )
  WHERE (
    status NOT IN ('Cancelado', 'Concluído')
    AND linha_id IS NOT NULL
    AND dt_inicio_previsto IS NOT NULL
    AND dt_fim_previsto IS NOT NULL
  );

-- 4. Índice composto para a query de verificação de conflito
CREATE INDEX IF NOT EXISTS idx_prog_conflito_range
  ON programacao_producao (linha_id, dt_inicio_previsto, dt_fim_previsto)
  WHERE status NOT IN ('Cancelado', 'Concluído');

-- 5. Índice para retiradas parciais
CREATE INDEX IF NOT EXISTS idx_retiradas_prog
  ON programacao_retiradas (programacao_id);

-- Verificação final
SELECT 'calendario_producao' AS tabela, count(*) AS registros FROM calendario_producao
UNION ALL
SELECT 'constraint no_overlap_linha', count(*) FROM pg_constraint WHERE conname = 'no_overlap_linha'
UNION ALL
SELECT 'idx_prog_conflito_range', count(*) FROM pg_indexes WHERE indexname = 'idx_prog_conflito_range';
