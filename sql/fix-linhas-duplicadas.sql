-- Reassign any programacoes that reference duplicate linha_ids (3-8)
-- back to the original ones (1 = Corte, 2 = Lapidação)
UPDATE programacao_producao
SET linha_id = 1
WHERE linha_id IN (3, 5, 7);

UPDATE programacao_producao
SET linha_id = 2
WHERE linha_id IN (4, 6, 8);

-- Remove the duplicate lines
DELETE FROM producao_linhas WHERE id IN (3, 4, 5, 6, 7, 8);

-- Confirm: should return exactly 2 rows
SELECT id, nome, tipo FROM producao_linhas ORDER BY id;
