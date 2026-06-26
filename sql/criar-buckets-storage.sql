-- Cria os buckets de storage para NF-e e Boleto
-- Rodar no Supabase → SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('nfe-pedidos',         'nfe-pedidos',         true, 20971520),
  ('boletos-pedidos',     'boletos-pedidos',      true, 20971520),
  ('romaneios-assinados', 'romaneios-assinados',  true, 20971520)
ON CONFLICT (id) DO NOTHING;

-- Policies de acesso nos objetos de storage

-- Leitura pública (SELECT)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'nfe public read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "nfe public read" ON storage.objects FOR SELECT USING (bucket_id = 'nfe-pedidos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'boleto public read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "boleto public read" ON storage.objects FOR SELECT USING (bucket_id = 'boletos-pedidos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'romaneio public read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "romaneio public read" ON storage.objects FOR SELECT USING (bucket_id = 'romaneios-assinados');
  END IF;
END $$;

-- Upload para autenticados (INSERT)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'nfe auth insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "nfe auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'nfe-pedidos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'boleto auth insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "boleto auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'boletos-pedidos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'romaneio auth insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "romaneio auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'romaneios-assinados' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Remover para autenticados (DELETE)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'nfe auth delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "nfe auth delete" ON storage.objects FOR DELETE USING (bucket_id = 'nfe-pedidos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'boleto auth delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "boleto auth delete" ON storage.objects FOR DELETE USING (bucket_id = 'boletos-pedidos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'romaneio auth delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "romaneio auth delete" ON storage.objects FOR DELETE USING (bucket_id = 'romaneios-assinados' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Colunas nfe_urls e boleto_urls na tabela pedidos
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS nfe_urls    text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS boleto_urls text[] DEFAULT NULL;
