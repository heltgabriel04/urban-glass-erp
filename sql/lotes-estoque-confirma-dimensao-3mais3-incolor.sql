-- ============================================================
-- lotes_estoque — confirma dimensão do lote migrado do produto 15
-- (Laminado 3+3 Incolor) — usuário confirmou 2026-07-21: mantém o
-- padrão antigo do 4+4, 3300×2250mm.
-- Causa raiz do P-065 não bater com o Corte Certo: esse lote (id=3,
-- 38 chapas, 282,15 m² de saldo) tinha dimensao_confirmada=false, então
-- o Otimizador excluía TODAS as peças de Laminado 3+3 Incolor do plano
-- (regra de 2026-07-21 — produto sem lote confirmado fica fora, sem
-- default, sem erro). Depois deste UPDATE, a próxima rodada do
-- Otimizador para pedidos com esse produto volta a incluir o 3+3.
-- Execute no Supabase SQL Editor.
-- ============================================================

UPDATE lotes_estoque
SET chapa_largura_mm = 3300,
    chapa_altura_mm  = 2250,
    dimensao_confirmada = true
WHERE id = 3
  AND produto_id = 15; -- trava extra: garante que só mexe no lote certo (Laminado 3+3 Incolor)

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, produto_id, chapa_largura_mm, chapa_altura_mm, m2_por_chapa, dimensao_confirmada
--   FROM lotes_estoque WHERE id = 3;
