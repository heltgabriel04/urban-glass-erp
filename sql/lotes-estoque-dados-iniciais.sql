-- ============================================================
-- lotes_estoque — dados iniciais (passos 2 e 4 da migração)
-- Execute no Supabase SQL Editor, DEPOIS de:
--   1. sql/lotes-estoque.sql (confirmado rodado)
--   2. sql/lotes-estoque-dimensao-opcional.sql
-- ============================================================

-- ── Passo 2: backfill dos 5 saldos hoje em `estoque` ─────────
-- Dimensão e origem da mercadoria ficam NULL de propósito — `estoque` era
-- um saldo agregado por produto, sem rastro de qual compra/CST/dimensão
-- originou cada chapa. dimensao_confirmada=false (default) marca esses
-- 5 lotes como pendentes de medição física real antes de entrarem no
-- otimizador. chapas_entrada/chapas_saldo/m2_saldo/custo_m2 copiados
-- 1:1 do saldo atual de `estoque`; dt_entrada = updated_at (data da
-- última atualização do saldo agregado — não há um "dt_entrada" real
-- em `estoque` pra herdar, essa é a aproximação mais honesta disponível).

INSERT INTO lotes_estoque
  (produto_id, origem_tipo, origem_mercadoria, chapa_largura_mm, chapa_altura_mm,
   chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada)
VALUES
  -- produto_id 10 — Laminado 4+4 Incolor
  (10, 'saldo_migrado', NULL, NULL, NULL, 354, 18,  133.65,   19.49, '2026-07-15'),
  -- produto_id 13 — Laminado 4+4 Verde
  (13, 'saldo_migrado', NULL, NULL, NULL, 180, 154, 1143.45,  28.35, '2026-06-19'),
  -- produto_id 15 — Laminado 3+3 Incolor
  (15, 'saldo_migrado', NULL, NULL, NULL, 117, 38,  282.15,   18.39, '2026-07-17'),
  -- produto_id 17 — Reflecta 4+4 Incolor (m2_por_chapa antigo já divergia do default 3300×2250 — motivo extra pra não chutar dimensão)
  (17, 'saldo_migrado', NULL, NULL, NULL, 72,  39,  310.443,  0,     '2026-07-21'),
  -- produto_id 21 — Refletivo 4+4 (idem)
  (21, 'saldo_migrado', NULL, NULL, NULL, 17,  7,   49.434,   0,     '2026-06-22');

-- ── Passo 4: lote novo, da nota fiscal de importação ─────────
-- NCM 70072900, "Laminado Incolor 8.38mm Importado 3660x2140", CST 200 —
-- mesmo item comercial do produto_id 10 (Laminado 4+4 Incolor), a nota só
-- usa a nomenclatura de espessura nominal (8.38mm = 4+4 com PVB) em vez do
-- nome de mercado. Dimensão real e confirmada pela própria nota.
-- custo_m2 fica NULL — ICMS/IPI creditável dessa NF ainda não decidido
-- com o contador (ver [[project-custeio-precificacao-vidros]] na memória);
-- qualquer relatório de margem rodado antes dessa decisão fica incompleto
-- pra este lote especificamente.
-- m2_saldo = chapas_saldo (102) × m2_por_chapa (3660×2140/1e6 = 7,8324) = 798,9048 — calculado, não veio pronto da nota.
-- origem_tipo/origem_id: sem linha em `compras` pra essa NF (não foi pedido
-- aqui) — origem_id fica NULL, origem_tipo só descreve a natureza da entrada.

INSERT INTO lotes_estoque
  (produto_id, origem_tipo, origem_id, origem_mercadoria, chapa_largura_mm, chapa_altura_mm,
   dimensao_confirmada, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada)
VALUES
  (10, 'nota_fiscal_entrada', NULL, '2', 3660, 2140, true, 102, 102, 798.9048, NULL, '2026-07-20');

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, produto_id, origem_tipo, origem_mercadoria, chapa_largura_mm,
--        chapa_altura_mm, m2_por_chapa, dimensao_confirmada, chapas_saldo,
--        m2_saldo, custo_m2, dt_entrada
--   FROM lotes_estoque ORDER BY produto_id, dt_entrada;
