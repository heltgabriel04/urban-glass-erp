-- ============================================================
-- Capacidade compartilhada (2 pessoas) — tipo novo de bloqueio
-- Execute no Supabase SQL Editor
-- Ver docs/superpowers/specs/2026-07-20-capacidade-compartilhada-cotacao-prazo-design.md
-- ============================================================

-- 'sem_recurso' = a linha não tem ninguém alocado nesse dia (as 2 pessoas
-- da produção estão na outra etapa) — diferente de 'manutencao' (máquina
-- parada) e 'recesso' (fábrica fechada). Usado pelo painel de alocação
-- diária em /programacao, reaproveitando o mesmo bloqueios_linha que já
-- alimenta o motor de agendamento (construirDiasBloqueadosPorLinha).
ALTER TABLE bloqueios_linha DROP CONSTRAINT IF EXISTS bloqueios_linha_tipo_check;
ALTER TABLE bloqueios_linha
  ADD CONSTRAINT bloqueios_linha_tipo_check
  CHECK (tipo IN ('manutencao', 'recesso', 'outro', 'sem_recurso'));

-- Verificação
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'bloqueios_linha_tipo_check';
