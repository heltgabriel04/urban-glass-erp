-- Contabilidade — Documentos Diversos (gap do SIEG)
-- Despesas administrativas recorrentes que não são NF-e/NFS-e (o SIEG só
-- captura documento fiscal formal): energia, água, telefone/internet,
-- guia de imposto, boleto diverso, reembolso de funcionário. Ao criar,
-- gera automaticamente um lançamento de Saída em Contas a Pagar vinculado
-- (lancamento_id) — mesmo espírito de gerarContaAPagarDaCompra.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS documentos_diversos (
  id                bigserial PRIMARY KEY,
  categoria         text NOT NULL CHECK (categoria IN (
                      'energia','agua','telefone_internet','guia_imposto',
                      'boleto_diverso','reembolso_funcionario','outros')),
  fornecedor_id     int REFERENCES fornecedores(id),
  competencia_ano   int NOT NULL,
  competencia_mes   int NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  descricao         text NOT NULL,
  valor             numeric(14,2) NOT NULL,
  vencimento        date,
  pdf_url           text,
  lancamento_id     int REFERENCES lancamentos(id),
  observacoes       text,
  deletado_em       timestamptz,
  deletado_por      text,
  motivo_exclusao   text,
  criado_por        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_diversos_competencia ON documentos_diversos (competencia_ano, competencia_mes) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_diversos_categoria    ON documentos_diversos (categoria)   WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_diversos_fornecedor   ON documentos_diversos (fornecedor_id);

ALTER TABLE documentos_diversos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'documentos_diversos') THEN
    CREATE POLICY "auth_select" ON documentos_diversos FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'documentos_diversos') THEN
    CREATE POLICY "auth_insert" ON documentos_diversos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'documentos_diversos') THEN
    CREATE POLICY "auth_update" ON documentos_diversos FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de DELETE — exclusão é sempre soft-delete via UPDATE (deletado_em).
