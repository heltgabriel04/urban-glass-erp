-- Adiciona colunas para NF-e e boleto na tabela pedidos
-- Rodar no Supabase SQL Editor

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS nfe_urls    text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS boleto_urls text[] DEFAULT NULL;

-- Criar buckets no Storage (fazer via Dashboard do Supabase → Storage → New bucket):
--   nome: nfe-pedidos    | público: sim
--   nome: boletos-pedidos | público: sim
