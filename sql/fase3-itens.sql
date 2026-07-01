-- Fase 3: Agendamento por item (granularidade de item_pedido)
-- Executar no Supabase SQL Editor

ALTER TABLE programacao_producao
  ADD COLUMN IF NOT EXISTS item_pedido_id INTEGER REFERENCES itens_pedido(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS predecessor_id UUID    REFERENCES programacao_producao(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prog_item_id     ON programacao_producao(item_pedido_id) WHERE item_pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prog_predecessor  ON programacao_producao(predecessor_id)  WHERE predecessor_id IS NOT NULL;

-- Verificação — deve retornar as duas colunas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'programacao_producao' AND column_name IN ('item_pedido_id', 'predecessor_id');
