-- ============================================================
-- Produto 27 (Vidro Laminado 4+4 Light Gray, cod VL-005) estava
-- disparando "Sem lote com dimensão confirmada — 19 peça(s) fora
-- do plano" no Otimizador: existe registro no agregado legado
-- `estoque` (id=14, ajuste manual de hoje, 18 chapas 3210x2400mm,
-- m2_por_chapa=7.7040 confirma a dimensão) mas nunca foi migrado
-- pra `lotes_estoque` (mesmo gap de sempre, ver comentário em
-- services/estoqueMovimentacoes.service.ts).
--
-- Usuário confirmou que as 30 chapas 3210x2400 informadas agora são
-- ENTRADA NOVA, somando com as 18 já gravadas — total 48 chapas.
--
-- 1) Atualiza o agregado legado `estoque` (18 → 48 chapas).
-- 2) Cria o lote confirmado em `lotes_estoque` com o total (48),
--    já que não existia nenhum lote pra esse produto ainda.
--
-- Execute no Supabase SQL Editor.
-- ============================================================

-- 1) Atualiza o agregado legado (soma as 30 chapas novas)
UPDATE estoque
SET chapas_entrada = chapas_entrada + 30,
    chapas_saldo   = chapas_saldo + 30,
    m2_entrada     = m2_entrada + 30 * 7.7040,
    m2_saldo       = m2_saldo + 30 * 7.7040
WHERE id = 14
  AND produto_id = 27;

-- 2) Cria o lote confirmado (total 48 chapas 3210x2400mm)
INSERT INTO lotes_estoque
  (produto_id, origem_tipo, chapa_largura_mm, chapa_altura_mm, chapas_entrada, chapas_saldo, m2_saldo, custo_m2, dt_entrada, dt_entrada_estimada, dimensao_confirmada, ativo)
VALUES
  (27, 'saldo_inicial', 3210, 2400, 48, 48, 48 * 7.7040, NULL, CURRENT_DATE, false, true, true);

-- ── Verificação ──────────────────────────────────────────────
-- Agregado legado deve mostrar 48 chapas de entrada/saldo:
-- SELECT id, produto_id, cod, chapas_entrada, chapas_saldo, m2_entrada, m2_saldo, m2_por_chapa
--   FROM estoque WHERE produto_id = 27;
--
-- Produto 27 deve mostrar 1 lote novo confirmado, 48 chapas 3210x2400:
-- SELECT id, produto_id, chapa_largura_mm, chapa_altura_mm, chapas_saldo, dimensao_confirmada, ativo, dt_entrada
--   FROM lotes_estoque WHERE produto_id = 27 ORDER BY id;
