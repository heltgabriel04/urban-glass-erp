-- Módulo Contabilidade — Fase 4
-- Consórcios: contrato + parcelas (geradas iguais a partir de
-- valor_credito/numero_parcelas) + lances + contemplação.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS consorcios (
  id                     bigserial PRIMARY KEY,
  descricao              text NOT NULL,
  administradora         text,
  grupo                  text,
  cota                   text,
  valor_credito          numeric(14,2) NOT NULL,
  numero_parcelas        int NOT NULL,
  valor_parcela          numeric(14,2) NOT NULL,
  data_adesao            date NOT NULL,
  status                 text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','contemplado','encerrado')),
  contemplado_em         date,
  carta_contemplacao_url text,
  contrato_pdf_url       text,
  observacoes            text,
  ativo                  boolean NOT NULL DEFAULT true,
  criado_por             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consorcios_parcelas (
  id              bigserial PRIMARY KEY,
  consorcio_id    bigint NOT NULL REFERENCES consorcios(id),
  numero_parcela  int NOT NULL,
  vencimento      date NOT NULL,
  valor           numeric(14,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  data_pagamento  date,
  comprovante_url text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consorcio_id, numero_parcela)
);

CREATE TABLE IF NOT EXISTS consorcios_lances (
  id           bigserial PRIMARY KEY,
  consorcio_id bigint NOT NULL REFERENCES consorcios(id),
  data         date NOT NULL,
  valor        numeric(14,2) NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('livre','embutido','fixo')),
  resultado    text NOT NULL DEFAULT 'pendente' CHECK (resultado IN ('pendente','aprovado','recusado')),
  observacoes  text,
  criado_por   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consorcios_parcelas_consorcio ON consorcios_parcelas (consorcio_id);
CREATE INDEX IF NOT EXISTS idx_consorcios_lances_consorcio   ON consorcios_lances (consorcio_id);

ALTER TABLE consorcios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE consorcios_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE consorcios_lances   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'consorcios') THEN
    CREATE POLICY "auth_select" ON consorcios FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'consorcios') THEN
    CREATE POLICY "auth_insert" ON consorcios FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'consorcios') THEN
    CREATE POLICY "auth_update" ON consorcios FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'consorcios_parcelas') THEN
    CREATE POLICY "auth_select" ON consorcios_parcelas FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'consorcios_parcelas') THEN
    CREATE POLICY "auth_insert" ON consorcios_parcelas FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'consorcios_parcelas') THEN
    CREATE POLICY "auth_update" ON consorcios_parcelas FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'consorcios_lances') THEN
    CREATE POLICY "auth_select" ON consorcios_lances FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'consorcios_lances') THEN
    CREATE POLICY "auth_insert" ON consorcios_lances FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'consorcios_lances') THEN
    CREATE POLICY "auth_update" ON consorcios_lances FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
