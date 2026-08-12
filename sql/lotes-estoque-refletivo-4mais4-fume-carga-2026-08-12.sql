-- ============================================================
-- 1) CORRIGE ERRO: desativa os 2 lotes duplicados criados por
--    engano hoje (ids 23 e 24) ao rodar de novo
--    sql/lotes-estoque-refletivo-4mais4-carga-2026-08-03.sql —
--    esse script é do produto 21 ("Refletivo 4+4", sem cor), que
--    já tinha sido corretamente aplicado em 03/08 (lote id=22,
--    hoje com 32 chapas de saldo real, após consumo em produção).
--    Reexecutar um INSERT sem trava de idempotência duplicou
--    +100 chapas fantasma nesse produto. `estoque` (agregado
--    legado) confirma que produto 21 só recebeu 50 chapas no
--    total (id=9, chapas_entrada=50, sem alteração hoje) — não
--    houve nenhum ajuste físico novo de produto 21 em 12/08.
--
-- 2) CRIA o lote que realmente falta: produto 20 ("Refletivo
--    4+4 Fumê" — produto DIFERENTE do 21, mesmo nome parecido) —
--    ajuste manual feito hoje em /estoque (500 chapas, m2_por_chapa
--    7.062 = 3300×2140mm, ver `estoque` id=13) só gravou no
--    agregado legado, nunca em lotes_estoque (mesmo gap de sempre,
--    ver comentário em services/estoqueMovimentacoes.service.ts).
--
-- Execute no Supabase SQL Editor.
-- ============================================================

-- 1) Desativa os 2 duplicados errados (produto 21)
UPDATE lotes_estoque
SET ativo = false
WHERE id IN (23, 24)
  AND produto_id = 21
  AND chapas_saldo = 50
  AND dt_entrada = CURRENT_DATE;

-- 2) Cria o lote confirmado do produto 20 (Refletivo 4+4 Fumê)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (20, 'saldo_inicial', 3300, 2140, 500, 500, 500 * 7.062, NULL, CURRENT_DATE, false, true, true);

-- ── Verificação ──────────────────────────────────────────────
-- Produto 21 deve voltar a mostrar só o lote id=22 ativo, com 32 chapas:
-- SELECT id, produto_id, chapa_largura_mm, chapa_altura_mm, chapas_saldo, dimensao_confirmada, ativo, dt_entrada
--   FROM lotes_estoque WHERE produto_id = 21 ORDER BY id;
--
-- Produto 20 deve mostrar 1 lote novo confirmado, 500 chapas 3300x2140:
-- SELECT id, produto_id, chapa_largura_mm, chapa_altura_mm, chapas_saldo, dimensao_confirmada, ativo, dt_entrada
--   FROM lotes_estoque WHERE produto_id = 20 ORDER BY id;
