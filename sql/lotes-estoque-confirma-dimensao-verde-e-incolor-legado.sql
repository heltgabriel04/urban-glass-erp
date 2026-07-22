-- ============================================================
-- lotes_estoque — confirma dimensão 3300x2250 pro dono da empresa
-- (2026-07-22) em 2 lotes legados migrados de `estoque`:
--   • id=2, produto_id 13 — Laminado 4+4 Verde
--   • id=1, produto_id 10 — Laminado 4+4 Incolor (lote ANTIGO —
--     não confundir com o lote 6, importado, que já tem dimensão
--     própria confirmada desde a migração)
--
-- Efeito no Otimizador: produto 13 volta a entrar no plano de corte
-- (só tinha esse lote, estava 100% fora até agora). Produto 10 passa
-- a ter 2 lotes utilizáveis com dimensões DIFERENTES (3300x2250 no
-- legado, 3660x2140 no importado) — a partir de agora o Otimizador
-- vai pedir escolha explícita do operador entre os dois quando o
-- pedido usar esse produto (regra já existente pra produto com 2+
-- lotes utilizáveis, passo 5 da migração).
--
-- NÃO inclui produto_id 17 (Reflecta 4+4 Incolor) nem 21 (Refletivo
-- 4+4): m2_por_chapa desses dois (7,869 e 7,704) não bate com
-- 3300x2250 (7,425) — divergência sinalizada ao usuário, aguardando
-- confirmação de que o dono mediu esses dois especificamente (e não
-- assumiu igual aos laminados) antes de gravar qualquer dimensão.
-- Execute no Supabase SQL Editor.
-- ============================================================

UPDATE lotes_estoque
SET chapa_largura_mm = 3300,
    chapa_altura_mm  = 2250,
    dimensao_confirmada = true
WHERE id = 2
  AND produto_id = 13; -- trava extra: só o lote do Laminado 4+4 Verde

UPDATE lotes_estoque
SET chapa_largura_mm = 3300,
    chapa_altura_mm  = 2250,
    dimensao_confirmada = true
WHERE id = 1
  AND produto_id = 10; -- trava extra: só o lote legado do Laminado 4+4 Incolor, nunca o id=6 (importado)

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, produto_id, chapa_largura_mm, chapa_altura_mm, m2_por_chapa, dimensao_confirmada
--   FROM lotes_estoque WHERE id IN (1, 2);
