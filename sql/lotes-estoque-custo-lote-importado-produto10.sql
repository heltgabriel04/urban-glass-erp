-- ============================================================
-- lotes_estoque — custo_m2 do lote importado da New Glass
-- (produto_id 10, Laminado 4+4 Incolor, lote id=6, 3660x2140, 102
-- chapas, NF de importação, dt_entrada 2026-07-20)
--
-- Decisão do contador (2026-07-22): ICMS e IPI dessa nota SÃO
-- creditáveis — logo não entram no custo, viram crédito à parte.
-- custo_m2 = valor dos produtos da nota / m² total do lote
--          = 75.496,50 / 798,9048 ≈ 94,50 (798,9048 = 102 chapas ×
--            7,8324 m²/chapa, o m² total ORIGINAL do lote — não o
--            saldo atual, que já foi parcialmente consumido pelo
--            pedido P-065).
--
-- Efeito colateral: esse era o único lote ativo de produto_id 10 com
-- custo_m2 null — depois deste UPDATE, produto 10 deixa de aparecer
-- como "indisponível" em /margem e /contabilidade/estoque.
-- Execute no Supabase SQL Editor.
-- ============================================================

UPDATE lotes_estoque
SET custo_m2 = 94.50
WHERE id = 6
  AND produto_id = 10
  AND origem_tipo = 'nota_fiscal_entrada'; -- trava extra: só o lote importado, nunca o legado (id=1)

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, custo_m2
--   FROM lotes_estoque WHERE id = 6;
