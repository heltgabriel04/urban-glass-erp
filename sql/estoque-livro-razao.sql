-- ============================================================
-- Fase 1 da reestruturação de estoque/produção:
--   1) Ficha técnica de embalagem no produto (colar/chapa)
--   2) Livro-razão de movimentações de estoque (estoque_movimentacoes)
--   3) Visão consolidada por colar/chapa/m²
-- ============================================================

-- 1. Ficha técnica de embalagem (opcional — preencher em /produtos)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS chapas_por_colar int;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS chapa_largura_mm numeric;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS chapa_altura_mm numeric;

-- 2. Livro-razão: toda entrada/saída de estoque passa a gerar uma linha aqui.
--    A tabela `estoque` continua existindo como o SALDO atual (cache de leitura
--    rápida), mas só é atualizada através deste livro-razão a partir de agora.
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id                bigserial PRIMARY KEY,
  produto_id        int REFERENCES produtos(id),
  tipo              text NOT NULL,   -- 'entrada_compra' | 'saida_producao' | 'ajuste' | 'devolucao' | 'saldo_inicial'
  origem_tipo       text,            -- 'otimizacao' | 'pedido_chapa' | 'manual' | 'saldo_inicial'
  origem_id         text,            -- chave de idempotência junto com produto_id
  chapas            numeric NOT NULL DEFAULT 0,  -- positivo = entrada, negativo = saída
  m2                numeric NOT NULL DEFAULT 0,  -- positivo = entrada, negativo = saída
  custo_unitario_m2 numeric,
  saldo_chapas_apos numeric,
  saldo_m2_apos     numeric,
  usuario           text,
  obs               text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Idempotência: a mesma origem (ex.: a mesma otimização) nunca gera 2 baixas
-- para o mesmo produto, mesmo se o botão/fluxo for acionado de novo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_mov_origem
  ON estoque_movimentacoes (origem_tipo, origem_id, produto_id)
  WHERE origem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto ON estoque_movimentacoes (produto_id);

-- 3. Saldo inicial: registra o saldo atual de `estoque` como ponto de partida
--    do livro-razão (não reprocessa o histórico antigo de otimizações, que não
--    tinha rastreio de duplicidade). Seguro de rodar mais de uma vez — só
--    insere para produtos que ainda não têm nenhum movimento.
INSERT INTO estoque_movimentacoes
  (produto_id, tipo, origem_tipo, origem_id, chapas, m2, custo_unitario_m2, saldo_chapas_apos, saldo_m2_apos, obs)
SELECT
  e.produto_id, 'saldo_inicial', 'saldo_inicial', 'init-' || e.produto_id,
  e.chapas_saldo, e.m2_saldo, e.custo_m2, e.chapas_saldo, e.m2_saldo,
  'Saldo capturado na migração para o livro-razão'
FROM estoque e
WHERE NOT EXISTS (
  SELECT 1 FROM estoque_movimentacoes m WHERE m.produto_id = e.produto_id
);

-- 4. m² comprometido: NÃO é uma coluna armazenada (evita contador que pode
--    dessincronizar). É derivado, em tempo real, da soma dos itens de pedidos
--    ainda não baixados (status "Aguardando otimização"), excluindo vidro do
--    cliente e excluindo itens que batem com a chapa inteira do produto
--    (esses já são baixados na hora da criação do pedido, nunca ficam
--    "comprometidos" — ver services/pedidos.service.ts:createPedido).
CREATE OR REPLACE VIEW vw_estoque_comprometido AS
SELECT
  ip.produto_id,
  COALESCE(SUM(ip.m2 * ip.quantidade), 0) AS m2_comprometido
FROM itens_pedido ip
JOIN pedidos p   ON p.id = ip.pedido_id
JOIN produtos pr ON pr.id = ip.produto_id
WHERE p.status = 'Aguardando otimização'
  AND ip.vidro_cliente = false
  AND NOT (
    pr.chapa_largura_mm IS NOT NULL AND pr.chapa_altura_mm IS NOT NULL AND (
      (abs(ip.largura - pr.chapa_largura_mm) < 50 AND abs(ip.altura - pr.chapa_altura_mm) < 50)
      OR (abs(ip.largura - pr.chapa_altura_mm) < 50 AND abs(ip.altura - pr.chapa_largura_mm) < 50)
    )
  )
GROUP BY ip.produto_id;

-- 5. Visão consolidada: colares inteiros / chapas soltas / m² / comprometido / disponível.
CREATE OR REPLACE VIEW vw_estoque_consolidado AS
SELECT
  e.produto_id,
  p.nome,
  p.chapas_por_colar,
  CASE WHEN p.chapas_por_colar > 0 THEN floor(e.chapas_saldo / p.chapas_por_colar) ELSE NULL END AS colares_inteiros,
  CASE WHEN p.chapas_por_colar > 0 THEN e.chapas_saldo % p.chapas_por_colar ELSE e.chapas_saldo END AS chapas_soltas,
  e.chapas_saldo,
  e.m2_saldo,
  COALESCE(c.m2_comprometido, 0) AS m2_comprometido,
  e.m2_saldo - COALESCE(c.m2_comprometido, 0) AS m2_disponivel,
  e.custo_m2
FROM estoque e
JOIN produtos p ON p.id = e.produto_id
LEFT JOIN vw_estoque_comprometido c ON c.produto_id = e.produto_id;
