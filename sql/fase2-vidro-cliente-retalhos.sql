-- ============================================================
-- Fase 2 da reestruturação de estoque/produção:
--   1) Rastreabilidade própria do vidro do cliente (material_cliente_mov)
--   2) Localização física dos retalhos
-- ============================================================

-- 1. Localização do retalho (opcional — preencher em /retalhos)
ALTER TABLE retalhos ADD COLUMN IF NOT EXISTS localizacao text;

-- 2. Livro-razão do vidro do cliente: nunca toca estoque_movimentacoes / estoque
--    (o material não é nosso) — só registra entrada/saída/devolução/perda pra
--    rastreabilidade e histórico de consumo.
CREATE TABLE IF NOT EXISTS material_cliente_mov (
  id             bigserial PRIMARY KEY,
  pedido_id      text REFERENCES pedidos(id),
  cliente_id     int REFERENCES clientes(id),
  item_pedido_id int REFERENCES itens_pedido(id),
  tipo           text NOT NULL,  -- 'entrada' | 'saida_producao' | 'devolucao' | 'perda'
  descricao      text,
  largura        numeric,
  altura         numeric,
  quantidade     int,
  nc_id          int REFERENCES nao_conformidades(id),
  dt_movimento   timestamptz NOT NULL DEFAULT now(),
  obs            text
);

-- Idempotência: 'entrada' e 'saida_producao' são eventos automáticos e únicos
-- por item (acontecem uma vez só). 'devolucao' e 'perda' ficam livres, porque
-- podem se repetir (ex.: devolução parcial em mais de uma visita).
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_cliente_item_tipo
  ON material_cliente_mov (item_pedido_id, tipo)
  WHERE item_pedido_id IS NOT NULL AND tipo IN ('entrada', 'saida_producao');

CREATE INDEX IF NOT EXISTS idx_material_cliente_pedido ON material_cliente_mov (pedido_id);
