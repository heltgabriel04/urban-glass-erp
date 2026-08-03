-- ============================================================
-- Cria o lote em lotes_estoque para o Refletivo 4+4 (produto_id 21)
-- que o usuário já lançou em 03/08/2026 via ajuste manual em
-- /estoque (50 chapas, 3660×2140mm) — esse ajuste só grava no
-- agregado legado `estoque` (registrarMovimentacao sem loteId,
-- ver services/estoqueMovimentacoes.service.ts linha ~15), nunca
-- em lotes_estoque. O Otimizador só lê lotes_estoque com
-- dimensao_confirmada=true, então esse estoque existia mas ficava
-- de fora de qualquer plano de corte. Sem isso o produto 21 tinha
-- só o lote #5, inativo/zerado (ver sql/carga-estoque-caixas-2026-07-23.sql).
-- Execute no Supabase SQL Editor.
-- ============================================================

INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (21, 'saldo_inicial', 3660, 2140, 50, 50, 50 * 7.8324, NULL, CURRENT_DATE, false, true, true);

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, codigo, produto_id, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, dimensao_confirmada, ativo, dt_entrada
--   FROM lotes_estoque WHERE produto_id = 21 ORDER BY id;
