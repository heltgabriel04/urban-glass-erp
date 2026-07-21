-- ============================================================
-- estoque_movimentacoes ganha lote_id — primeiro consumidor real:
-- baixa de produção do Otimizador (app/otimizador/page.tsx), que já
-- resolve qual lote foi usado desde o passo 5 da migração de lotes_estoque.
-- Nullable: movimentações antigas (e os outros pontos de baixa que ainda
-- não foram migrados — venda direta de chapa inteira, recebimento de
-- compra, ajuste manual em /estoque) continuam null, representando o
-- agregado por produto de antes desta migração.
-- Execute no Supabase SQL Editor.
-- ============================================================

ALTER TABLE estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS lote_id bigint REFERENCES lotes_estoque(id);

CREATE INDEX IF NOT EXISTS idx_estoque_movimentacoes_lote_id
  ON estoque_movimentacoes (lote_id) WHERE lote_id IS NOT NULL;

-- ── Verificação ──────────────────────────────────────────────
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'estoque_movimentacoes' AND column_name = 'lote_id';
