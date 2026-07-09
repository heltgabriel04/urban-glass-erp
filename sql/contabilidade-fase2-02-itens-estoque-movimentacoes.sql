-- Módulo Contabilidade — Fase 2
-- Livro-razão dos itens de estoque geral. Cada linha grava `saldo_apos` E
-- `custo_medio_apos` (diferente do ledger de vidro, que só guarda saldo) —
-- é isso que permite reconstruir Estoque Inicial/Final de um período sem
-- replay completo: basta pegar a última linha antes/até uma data de corte.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS itens_estoque_movimentacoes (
  id                  bigserial PRIMARY KEY,
  item_id             bigint NOT NULL REFERENCES itens_estoque_gerais(id),
  tipo                text NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','perda','transferencia','saldo_inicial')),
  origem_tipo         text NOT NULL DEFAULT 'manual' CHECK (origem_tipo IN ('manual','documento_fiscal','saldo_inicial')),
  origem_id           text,
  documento_fiscal_id bigint REFERENCES documentos_fiscais(id),

  quantidade          numeric(14,3) NOT NULL DEFAULT 0,
  custo_unitario      numeric(14,4),

  saldo_apos          numeric(14,3) NOT NULL,
  custo_medio_apos    numeric(14,4) NOT NULL,

  localizacao_origem  text,
  localizacao_destino text,

  usuario             text,
  obs                 text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_estoque_mov_origem
  ON itens_estoque_movimentacoes (origem_tipo, origem_id, item_id)
  WHERE origem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itens_estoque_mov_item       ON itens_estoque_movimentacoes (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_itens_estoque_mov_created    ON itens_estoque_movimentacoes (created_at);
CREATE INDEX IF NOT EXISTS idx_itens_estoque_mov_doc_fiscal ON itens_estoque_movimentacoes (documento_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_itens_estoque_mov_tipo       ON itens_estoque_movimentacoes (tipo);

-- Mesmo padrão do ledger de vidro (estoque_movimentacoes): RLS desabilitado
-- porque a reversão precisa fazer DELETE físico pelo client autenticado.
ALTER TABLE itens_estoque_movimentacoes DISABLE ROW LEVEL SECURITY;
