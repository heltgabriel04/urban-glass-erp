-- ============================================================
-- Reorganização de retalhos: produção passou a separar os retalhos
-- físicos por box, e espessura vira campo próprio (antes só dava pra
-- saber pelo texto livre de produto_nome).
-- ============================================================

ALTER TABLE retalhos ADD COLUMN IF NOT EXISTS box text;
ALTER TABLE retalhos ADD COLUMN IF NOT EXISTS espessura numeric;

CREATE INDEX IF NOT EXISTS idx_retalhos_box ON retalhos (box);
