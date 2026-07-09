-- Módulo Contabilidade — Fase 3
-- Cadastro de Ativo Imobilizado (máquinas, veículos, móveis, informática,
-- imóveis etc.). Depreciação NÃO é armazenada — é calculada em TS a
-- partir de valor_aquisicao/valor_residual/vida_util_meses/data_aquisicao
-- + a data de hoje (lib/depreciacao.ts), então não precisa de ledger.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS ativos_imobilizados (
  id                    bigserial PRIMARY KEY,
  numero_patrimonio     text NOT NULL UNIQUE,
  descricao             text NOT NULL,
  categoria             text NOT NULL CHECK (categoria IN (
                          'maquinas_equipamentos','veiculos','moveis_utensilios',
                          'informatica','imoveis','outros')),
  fornecedor_id         int REFERENCES fornecedores(id),
  documento_fiscal_id   bigint REFERENCES documentos_fiscais(id),
  numero_nota           text,
  plano_contas_id       int REFERENCES plano_contas(id),

  valor_aquisicao       numeric(14,2) NOT NULL,
  valor_residual        numeric(14,2) NOT NULL DEFAULT 0,
  vida_util_meses       int NOT NULL,
  data_aquisicao        date NOT NULL,

  localizacao           text,
  responsavel           text,
  garantia_ate          date,

  xml_url               text,
  pdf_url               text,
  manual_url            text,
  fotos_urls            text[],

  observacoes           text,
  ativo                 boolean NOT NULL DEFAULT true,

  criado_por            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ativos_imob_categoria   ON ativos_imobilizados (categoria);
CREATE INDEX IF NOT EXISTS idx_ativos_imob_ativo        ON ativos_imobilizados (ativo);
CREATE INDEX IF NOT EXISTS idx_ativos_imob_fornecedor   ON ativos_imobilizados (fornecedor_id);

ALTER TABLE ativos_imobilizados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'ativos_imobilizados') THEN
    CREATE POLICY "auth_select" ON ativos_imobilizados FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'ativos_imobilizados') THEN
    CREATE POLICY "auth_insert" ON ativos_imobilizados FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'ativos_imobilizados') THEN
    CREATE POLICY "auth_update" ON ativos_imobilizados FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de DELETE — desativação é sempre via `ativo=false`, nunca DELETE físico.
