-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote A — Núcleo de lançamento
-- Juros/multa/desconto na baixa, soft-delete, fornecedor
-- estruturado, grupo de parcelamento.
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

ALTER TABLE baixas_lancamento ADD COLUMN IF NOT EXISTS valor_juros    numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE baixas_lancamento ADD COLUMN IF NOT EXISTS valor_multa    numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE baixas_lancamento ADD COLUMN IF NOT EXISTS valor_desconto numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fornecedor_id         int REFERENCES fornecedores(id) ON DELETE SET NULL;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS deletado_em           timestamptz;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS deletado_por          text;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS deletado_motivo       text;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS grupo_parcelamento_id uuid;

CREATE INDEX IF NOT EXISTS idx_lancamentos_deletado_em ON lancamentos (deletado_em);
CREATE INDEX IF NOT EXISTS idx_lancamentos_fornecedor_id ON lancamentos (fornecedor_id);
