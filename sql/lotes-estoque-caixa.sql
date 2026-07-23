-- ============================================================
-- lotes_estoque ganha 2 colunas pra virar "caixa física"
-- rastreável: código legível (derivado do id, nunca digitado
-- manualmente) e token opaco pro QR da etiqueta (sub-projeto 3).
-- Execute no Supabase SQL Editor.
-- ============================================================

ALTER TABLE lotes_estoque
  ADD COLUMN IF NOT EXISTS codigo text GENERATED ALWAYS AS ('CX-' || lpad(id::text, 6, '0')) STORED,
  ADD COLUMN IF NOT EXISTS qr_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid();

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, codigo, qr_token FROM lotes_estoque ORDER BY id LIMIT 10;
