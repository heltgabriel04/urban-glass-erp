-- ============================================================
-- Fase 5 — Permite sobrepor pedidos na mesma linha + limpa nomes
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Remove a trava de não-sobreposição por linha. Pedidos do mesmo
--    cliente/obra às vezes são cortados juntos fisicamente (ex.: plano
--    externo Corte Certo) e precisam aparecer sobrepostos no Gantt — quem
--    decide isso agora é o usuário (arrastando/agendando), não uma
--    constraint rígida do banco.
ALTER TABLE programacao_producao
  DROP CONSTRAINT IF EXISTS no_overlap_linha;

-- 2. Nomes mais limpos das linhas — "Linha 1 – Corte" / "Linha 2 –
--    Lapidação" viram só "Corte" / "Lapidação" (a linha "Separação" já
--    está limpa e não precisa mudar).
UPDATE producao_linhas SET nome = 'Corte'     WHERE nome = 'Linha 1 – Corte';
UPDATE producao_linhas SET nome = 'Lapidação' WHERE nome = 'Linha 2 – Lapidação';

-- Verificação
SELECT 'constraint no_overlap_linha (deve ser 0)' AS item, count(*) AS resultado
  FROM pg_constraint WHERE conname = 'no_overlap_linha'
UNION ALL
SELECT 'linhas renomeadas', count(*) FROM producao_linhas WHERE nome IN ('Corte', 'Lapidação');

SELECT id, nome, tipo FROM producao_linhas ORDER BY id;
