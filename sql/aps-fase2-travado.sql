-- ============================================================
-- APS Fase 2 — coluna "travado" em programacao_producao
-- Marca blocos reposicionados manualmente (drag/resize no Gantt),
-- para que o motor de agendamento automático (Fase 2+) nunca os mova.
-- Execute no SQL Editor do Supabase.
-- ============================================================

ALTER TABLE programacao_producao
  ADD COLUMN IF NOT EXISTS travado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN programacao_producao.travado IS
  'Bloco reposicionado manualmente (drag ou resize) — o motor de agendamento automático nunca deve movê-lo.';

-- Verificação
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'programacao_producao' AND column_name = 'travado';
