-- ============================================================
-- Fase 4 da reestruturação de estoque/produção:
--   Módulo de Compras (fornecedor → recebimento → entrada no livro-razão)
-- ============================================================

CREATE TABLE IF NOT EXISTS compras (
  id             text PRIMARY KEY,        -- 'C-001', sequencial
  fornecedor_id  int REFERENCES fornecedores(id),
  nf             text,
  dt_compra      date NOT NULL DEFAULT current_date,
  condicao_pgto  text,
  status         text NOT NULL DEFAULT 'rascunho',  -- 'rascunho' | 'recebido'
  valor_total    numeric NOT NULL DEFAULT 0,
  obs            text,
  dt_recebimento timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compras_itens (
  id                bigserial PRIMARY KEY,
  compra_id         text REFERENCES compras(id) ON DELETE CASCADE,
  produto_id        int REFERENCES produtos(id),
  colares           numeric,
  chapas            numeric NOT NULL,
  m2_por_chapa      numeric NOT NULL,
  m2                numeric NOT NULL,
  custo_unitario_m2 numeric NOT NULL DEFAULT 0,
  subtotal          numeric NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_compras_itens_compra ON compras_itens (compra_id);
