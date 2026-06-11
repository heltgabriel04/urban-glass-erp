-- Migration: tabela de parâmetros fiscais padrão da empresa
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS config_fiscal_padrao (
  id                  integer PRIMARY KEY DEFAULT 1,
  regime              text    NOT NULL DEFAULT 'normal',
  aliq_icms_dentro    numeric(5,2) NOT NULL DEFAULT 18.00,
  aliq_icms_fora      numeric(5,2) NOT NULL DEFAULT 12.00,
  aliq_pis            numeric(5,2) NOT NULL DEFAULT 1.65,
  aliq_cofins         numeric(5,2) NOT NULL DEFAULT 7.60,
  aliq_ipi            numeric(5,2) NOT NULL DEFAULT 0.00,
  cst_icms_padrao     text    NOT NULL DEFAULT '00',
  cfop_dentro_padrao  text    NOT NULL DEFAULT '5102',
  cfop_fora_padrao    text    NOT NULL DEFAULT '6102',
  ncm_padrao          text    NOT NULL DEFAULT '70031200',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Garante que existe sempre exatamente 1 linha
INSERT INTO config_fiscal_padrao (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Habilita RLS e permite leitura/escrita para usuários autenticados
ALTER TABLE config_fiscal_padrao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read"   ON config_fiscal_padrao FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_update" ON config_fiscal_padrao FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON config_fiscal_padrao FOR INSERT WITH CHECK (auth.role() = 'authenticated');
