-- ============================================================
-- Carga real do estoque de vidro (2026-07-23) — substitui o
-- estoque atual (lotes_estoque + agregado estoque) pela contagem
-- física real informada pelo usuário, organizada em caixas.
-- Sub-projeto 2 de 3 (ver docs/superpowers/specs/2026-07-23-carga-estoque-caixas-design.md).
-- Execute no Supabase SQL Editor.
-- ============================================================

-- ── 1. Zera as 6 caixas/lotes atuais (não deleta — preserva
--       referências de estoque_movimentacoes.lote_id) ──────────
UPDATE lotes_estoque
SET chapas_saldo = 0, m2_saldo = 0, ativo = false
WHERE id IN (1, 2, 3, 4, 5, 6);

-- ── 2. Insere as 12 caixas novas ────────────────────────────
-- Laminado 4+4 Incolor (produto 10) — 3660×2140, 6 caixas fechadas
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
SELECT 10, 'saldo_inicial', 3660, 2140, 17, 17, 17 * 7.8324, NULL, '2026-07-21', false, true, true
FROM generate_series(1, 6);

-- Laminado 4+4 Incolor (produto 10) — 3300×2250, 1 caixa aberta (16/18)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (10, 'saldo_inicial', 3300, 2250, 18, 16, 16 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Laminado 3+3 Incolor (produto 15) — 3300×2250, 2 caixas fechadas
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
SELECT 15, 'saldo_inicial', 3300, 2250, 24, 24, 24 * 7.425, NULL, CURRENT_DATE, true, true, true
FROM generate_series(1, 2);

-- Laminado 3+3 Incolor (produto 15) — 3300×2250, 1 caixa aberta (10/24)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (15, 'saldo_inicial', 3300, 2250, 24, 10, 10 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Laminado 4+4 Verde (produto 13) — 3300×2250, 1 caixa fechada
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (13, 'saldo_inicial', 3300, 2250, 18, 18, 18 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Laminado 4+4 Verde (produto 13) — 3300×2250, 1 caixa aberta (13/18)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (13, 'saldo_inicial', 3300, 2250, 18, 13, 13 * 7.425, NULL, CURRENT_DATE, true, true, true);

-- Reflecta 4+4 Incolor (produto 17) — 3660×2140, 2 caixas fechadas
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
SELECT 17, 'saldo_inicial', 3660, 2140, 17, 17, 17 * 7.8324, NULL, CURRENT_DATE, true, true, true
FROM generate_series(1, 2);

-- Reflecta 4+4 Incolor (produto 17) — 3660×2140, 1 caixa aberta (11/17)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (17, 'saldo_inicial', 3660, 2140, 17, 11, 11 * 7.8324, NULL, CURRENT_DATE, true, true, true);

-- ── 3. Atualiza a tabela agregada `estoque` (ainda lida por
--       app/estoque/page.tsx) — trata como saldo inicial novo,
--       não soma ao histórico antigo ───────────────────────────
UPDATE estoque SET
  chapas_entrada = 118, m2_entrada = 917.7048,
  chapas_saldo   = 118, m2_saldo   = 917.7048,
  m2_consumido   = 0,   custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 10;

UPDATE estoque SET
  chapas_entrada = 31, m2_entrada = 230.175,
  chapas_saldo   = 31, m2_saldo   = 230.175,
  m2_consumido   = 0,  custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 13;

UPDATE estoque SET
  chapas_entrada = 58, m2_entrada = 430.65,
  chapas_saldo   = 58, m2_saldo   = 430.65,
  m2_consumido   = 0,  custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 15;

UPDATE estoque SET
  chapas_entrada = 45, m2_entrada = 352.458,
  chapas_saldo   = 45, m2_saldo   = 352.458,
  m2_consumido   = 0,  custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 17;

UPDATE estoque SET
  chapas_entrada = 0, m2_entrada = 0,
  chapas_saldo   = 0, m2_saldo   = 0,
  m2_consumido   = 0, custo_m2   = 0,
  updated_at     = now()
WHERE produto_id = 21;

-- ── 4. Auditoria — 1 linha por produto afetado em
--       estoque_movimentacoes, registrando o delta do reset
--       (positivo = estoque novo maior que o antigo) ───────────
INSERT INTO estoque_movimentacoes
  (produto_id, tipo, origem_tipo, chapas, m2, saldo_chapas_apos, saldo_m2_apos, obs)
VALUES
  (10, 'saldo_inicial', 'saldo_inicial',  18,  175.2048, 118, 917.7048, 'Recontagem física do estoque — 2026-07-23'),
  (13, 'saldo_inicial', 'saldo_inicial', -123, -913.275,  31, 230.175,  'Recontagem física do estoque — 2026-07-23'),
  (15, 'saldo_inicial', 'saldo_inicial',  20,  148.5,     58, 430.65,   'Recontagem física do estoque — 2026-07-23'),
  (17, 'saldo_inicial', 'saldo_inicial',   6,   42.015,   45, 352.458,  'Recontagem física do estoque — 2026-07-23'),
  (21, 'saldo_inicial', 'saldo_inicial',  -7,  -49.434,    0,   0,      'Recontagem física do estoque — 2026-07-23');

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, codigo, produto_id, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, ativo, dt_entrada, dt_entrada_estimada
--   FROM lotes_estoque WHERE produto_id IN (10,13,15,17) ORDER BY produto_id, id;
-- SELECT produto_id, chapas_saldo, m2_saldo FROM estoque WHERE produto_id IN (10,13,15,17,21) ORDER BY produto_id;
-- SELECT produto_id, tipo, chapas, m2, saldo_chapas_apos, saldo_m2_apos FROM estoque_movimentacoes WHERE origem_tipo = 'saldo_inicial' ORDER BY produto_id;
