-- ============================================================
-- lotes_estoque — dt_entrada_estimada
-- Execute no Supabase SQL Editor, DEPOIS de sql/lotes-estoque-dados-iniciais.sql
-- (já confirmado rodado).
-- ============================================================
--
-- true = dt_entrada NÃO é uma data de entrada real, é aproximada (caso dos
-- 5 lotes migrados de `estoque`, que usaram estoque.updated_at — última
-- vez que a linha de saldo agregado foi tocada, não a data em que a chapa
-- entrou fisicamente). false = dt_entrada vem de um documento real (nota
-- fiscal, etc). Necessário pra qualquer lógica futura de PEPS saber
-- diferenciar lote com data confiável de lote com data estimada.
--
-- Default true: um lote novo que não passar explicitamente por essa
-- distinção fica marcado como "não confie nessa data" até prova em
-- contrário — mesmo espírito de dimensao_confirmada (default false).

ALTER TABLE lotes_estoque
  ADD COLUMN IF NOT EXISTS dt_entrada_estimada boolean NOT NULL DEFAULT true;

-- Os 5 lotes migrados (dt_entrada = estoque.updated_at)
UPDATE lotes_estoque SET dt_entrada_estimada = true
  WHERE origem_tipo = 'saldo_migrado';

-- O lote novo da nota fiscal de importação (produto_id 10, 3660×2140,
-- dt_entrada = data real da NF)
UPDATE lotes_estoque SET dt_entrada_estimada = false
  WHERE origem_tipo = 'nota_fiscal_entrada';

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, produto_id, origem_tipo, dt_entrada, dt_entrada_estimada
--   FROM lotes_estoque ORDER BY produto_id, dt_entrada;
