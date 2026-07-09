-- Módulo Contabilidade — Fase 1
-- Tabela central de documentos fiscais que não são NF de venda (essas já
-- existem em `notas_fiscais`): compra/entrada, perda, cancelamento (lado
-- compra), carta de correção, inutilização de numeração.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS documentos_fiscais (
  id                bigserial PRIMARY KEY,

  tipo              text NOT NULL CHECK (tipo IN ('compra','perda','cancelamento','carta_correcao','inutilizacao')),
  entrada           boolean NOT NULL DEFAULT false,  -- true = também classificado como "NF Entrada"

  competencia_ano   int  NOT NULL,
  competencia_mes   int  NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),

  -- Identificação do documento de origem (nota do fornecedor)
  numero_documento  text,
  serie             text,
  chave_acesso      text,   -- 44 dígitos quando NF-e

  -- Vínculos
  fornecedor_id     int  REFERENCES fornecedores(id),
  compra_id         text REFERENCES compras(id),        -- liga a uma compra de vidro já existente, quando aplicável
  nota_fiscal_id    int  REFERENCES notas_fiscais(id),   -- liga carta_correcao/inutilizacao a uma NF de venda existente

  -- Classificação fiscal (compra/entrada)
  ncm               text,
  cfop              text,
  cst               text,

  -- Valores (compra/entrada)
  valor_produtos    numeric(14,2),
  valor_icms        numeric(14,2),
  valor_pis         numeric(14,2),
  valor_cofins      numeric(14,2),
  valor_ipi         numeric(14,2),
  valor_total       numeric(14,2),

  -- NF Perda
  motivo            text,
  material          text,
  quantidade        numeric(14,3),

  -- Inutilização de numeração
  numero_inicial    int,
  numero_final      int,

  -- Carta de Correção
  sequencia_evento  int,
  texto_correcao    text,

  responsavel       text,
  observacoes       text,

  xml_url           text,
  pdf_url           text,
  fotos_urls        text[],

  status            text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),

  criado_por        text,
  deletado_em       timestamptz,   -- soft delete — nunca DELETE físico
  deletado_por      text,
  motivo_exclusao   text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_fiscais_competencia
  ON documentos_fiscais (competencia_ano, competencia_mes) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_fiscais_tipo        ON documentos_fiscais (tipo)          WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_fiscais_fornecedor  ON documentos_fiscais (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_doc_fiscais_compra      ON documentos_fiscais (compra_id);
CREATE INDEX IF NOT EXISTS idx_doc_fiscais_nota        ON documentos_fiscais (nota_fiscal_id);

-- Documento duplicado: mesma chave de acesso não pode aparecer duas vezes ativa
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_fiscais_chave
  ON documentos_fiscais (chave_acesso) WHERE deletado_em IS NULL AND chave_acesso IS NOT NULL;

ALTER TABLE documentos_fiscais ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'documentos_fiscais') THEN
    CREATE POLICY "auth_select" ON documentos_fiscais FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'documentos_fiscais') THEN
    CREATE POLICY "auth_insert" ON documentos_fiscais FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'documentos_fiscais') THEN
    CREATE POLICY "auth_update" ON documentos_fiscais FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de DELETE de propósito: exclusão é sempre soft (UPDATE deletado_em).
