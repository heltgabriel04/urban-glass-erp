-- Módulo Contabilidade — Fase 2
-- Cadastro de itens de estoque geral (tudo que NÃO é vidro: ferragens,
-- perfis/alumínio, insumos, equipamentos, consumíveis, EPIs, material de
-- escritório). Saldo/custo médio ficam como cache inline nesta tabela —
-- só são escritos por services/itensEstoqueMovimentacoes.service.ts, nunca
-- editados direto pelo formulário de cadastro.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS itens_estoque_gerais (
  id                       bigserial PRIMARY KEY,
  codigo                   text NOT NULL UNIQUE,
  descricao                text NOT NULL,
  grupo                    text NOT NULL CHECK (grupo IN (
                             'ferragens','perfis_aluminio','insumos','equipamentos',
                             'consumiveis','epis','material_escritorio','outros')),
  subgrupo                 text,
  localizacao              text,
  unidade                  text NOT NULL DEFAULT 'un',
  ncm                      text,
  fornecedor_principal_id  int REFERENCES fornecedores(id),
  estoque_minimo           numeric(14,3) NOT NULL DEFAULT 0,
  ativo                    boolean NOT NULL DEFAULT true,

  -- Cache de saldo/custo — só é escrito por itensEstoqueMovimentacoes.service.ts.
  saldo_qtd                numeric(14,3) NOT NULL DEFAULT 0,
  custo_medio              numeric(14,4) NOT NULL DEFAULT 0,
  valor_total              numeric(14,2) GENERATED ALWAYS AS (round(saldo_qtd * custo_medio, 2)) STORED,
  ultima_compra_em         timestamptz,
  ultima_movimentacao_em   timestamptz,

  criado_por               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_estoque_ger_grupo ON itens_estoque_gerais (grupo);
CREATE INDEX IF NOT EXISTS idx_itens_estoque_ger_ativo ON itens_estoque_gerais (ativo);

ALTER TABLE itens_estoque_gerais ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'itens_estoque_gerais') THEN
    CREATE POLICY "auth_select" ON itens_estoque_gerais FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'itens_estoque_gerais') THEN
    CREATE POLICY "auth_insert" ON itens_estoque_gerais FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'itens_estoque_gerais') THEN
    CREATE POLICY "auth_update" ON itens_estoque_gerais FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de DELETE — desativação é sempre via `ativo=false`, nunca DELETE
-- físico (o cadastro pode ter FK de itens_estoque_movimentacoes apontando pra ele).
