-- Módulo Contabilidade — Fase 4
-- Cartões corporativos (a empresa usa pra pagar despesas — não é
-- maquininha/adquirente de recebimento). 3 tabelas: cadastro do cartão,
-- fatura mensal (só cartão tipo crédito) e detalhamento (linhas da
-- fatura ou lançamentos de débito soltos).
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS cartoes (
  id                bigserial PRIMARY KEY,
  nome              text NOT NULL,
  tipo              text NOT NULL CHECK (tipo IN ('credito','debito')),
  bandeira          text,
  banco_emissor     text,
  final_numero      text,
  conta_bancaria_id int REFERENCES contas_bancarias(id),
  limite            numeric(14,2),
  dia_fechamento    int CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento    int CHECK (dia_vencimento BETWEEN 1 AND 31),
  ativo             boolean NOT NULL DEFAULT true,
  criado_por        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cartoes_faturas (
  id                      bigserial PRIMARY KEY,
  cartao_id               bigint NOT NULL REFERENCES cartoes(id),
  competencia_ano         int NOT NULL,
  competencia_mes         int NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  valor_total             numeric(14,2) NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada','paga')),
  data_fechamento         date,
  data_vencimento         date,
  data_pagamento          date,
  pdf_url                 text,
  comprovante_pagamento_url text,
  observacoes             text,
  criado_por              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cartao_id, competencia_ano, competencia_mes)
);

CREATE TABLE IF NOT EXISTS cartoes_lancamentos (
  id              bigserial PRIMARY KEY,
  cartao_id       bigint NOT NULL REFERENCES cartoes(id),
  fatura_id       bigint REFERENCES cartoes_faturas(id),
  data            date NOT NULL,
  descricao       text NOT NULL,
  plano_contas_id int REFERENCES plano_contas(id),
  fornecedor_id   int REFERENCES fornecedores(id),
  valor           numeric(14,2) NOT NULL,  -- positivo=despesa, negativo=estorno/crédito
  parcela_atual   int,
  parcela_total   int,
  comprovante_url text,
  conciliado      boolean NOT NULL DEFAULT false,
  observacoes     text,
  criado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cartoes_faturas_cartao ON cartoes_faturas (cartao_id);
CREATE INDEX IF NOT EXISTS idx_cartoes_lanc_cartao     ON cartoes_lancamentos (cartao_id);
CREATE INDEX IF NOT EXISTS idx_cartoes_lanc_fatura     ON cartoes_lancamentos (fatura_id);

ALTER TABLE cartoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartoes_faturas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartoes_lancamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'cartoes') THEN
    CREATE POLICY "auth_select" ON cartoes FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'cartoes') THEN
    CREATE POLICY "auth_insert" ON cartoes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'cartoes') THEN
    CREATE POLICY "auth_update" ON cartoes FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'cartoes_faturas') THEN
    CREATE POLICY "auth_select" ON cartoes_faturas FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'cartoes_faturas') THEN
    CREATE POLICY "auth_insert" ON cartoes_faturas FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'cartoes_faturas') THEN
    CREATE POLICY "auth_update" ON cartoes_faturas FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  -- cartoes_lancamentos é o detalhamento (linhas soltas) — tem policy de
  -- DELETE porque não é um ledger de saldo (diferente do de Estoque na
  -- Fase 2), é só uma linha de detalhamento removível sem side-effect.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'cartoes_lancamentos') THEN
    CREATE POLICY "auth_select" ON cartoes_lancamentos FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'cartoes_lancamentos') THEN
    CREATE POLICY "auth_insert" ON cartoes_lancamentos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'cartoes_lancamentos') THEN
    CREATE POLICY "auth_update" ON cartoes_lancamentos FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete' AND tablename = 'cartoes_lancamentos') THEN
    CREATE POLICY "auth_delete" ON cartoes_lancamentos FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;
