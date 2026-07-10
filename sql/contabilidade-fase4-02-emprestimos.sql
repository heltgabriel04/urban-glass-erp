-- Módulo Contabilidade — Fase 4
-- Empréstimos bancários com tabela de amortização (Sistema Price),
-- gerada uma vez ao criar o empréstimo (lib/amortizacao.ts).
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS emprestimos (
  id                    bigserial PRIMARY KEY,
  descricao             text NOT NULL,
  banco                 text,
  conta_bancaria_id     int REFERENCES contas_bancarias(id),
  valor_contratado      numeric(14,2) NOT NULL,
  taxa_juros_pct_am     numeric(8,4) NOT NULL,
  numero_parcelas       int NOT NULL,
  data_contratacao      date NOT NULL,
  data_primeira_parcela date NOT NULL,
  contrato_pdf_url      text,
  observacoes           text,
  ativo                 boolean NOT NULL DEFAULT true,
  criado_por            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emprestimos_parcelas (
  id                  bigserial PRIMARY KEY,
  emprestimo_id       bigint NOT NULL REFERENCES emprestimos(id),
  numero_parcela      int NOT NULL,
  vencimento          date NOT NULL,
  valor_parcela       numeric(14,2) NOT NULL,
  valor_juros         numeric(14,2) NOT NULL,
  valor_amortizacao   numeric(14,2) NOT NULL,
  saldo_devedor_apos  numeric(14,2) NOT NULL,
  status              text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  data_pagamento      date,
  comprovante_url     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emprestimo_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_emprestimos_parcelas_emprestimo ON emprestimos_parcelas (emprestimo_id);

ALTER TABLE emprestimos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE emprestimos_parcelas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'emprestimos') THEN
    CREATE POLICY "auth_select" ON emprestimos FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'emprestimos') THEN
    CREATE POLICY "auth_insert" ON emprestimos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'emprestimos') THEN
    CREATE POLICY "auth_update" ON emprestimos FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'emprestimos_parcelas') THEN
    CREATE POLICY "auth_select" ON emprestimos_parcelas FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'emprestimos_parcelas') THEN
    CREATE POLICY "auth_insert" ON emprestimos_parcelas FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'emprestimos_parcelas') THEN
    CREATE POLICY "auth_update" ON emprestimos_parcelas FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de DELETE nas parcelas — a tabela é o plano de amortização
-- gerado de uma vez, não um cadastro editável linha a linha.
