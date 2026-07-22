-- Bucket + coluna pra anexo de comprovante de pagamento no pedido
-- (4o tipo de documento, mesmo esquema de Romaneio/NF-e/Boleto)
-- Rodar no Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('comprovantes-pagamento-pedidos', 'comprovantes-pagamento-pedidos', true, 20971520)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comprovante pagamento public read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "comprovante pagamento public read" ON storage.objects FOR SELECT USING (bucket_id = 'comprovantes-pagamento-pedidos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comprovante pagamento auth insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "comprovante pagamento auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'comprovantes-pagamento-pedidos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comprovante pagamento auth delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "comprovante pagamento auth delete" ON storage.objects FOR DELETE USING (bucket_id = 'comprovantes-pagamento-pedidos' AND auth.role() = 'authenticated');
  END IF;
END $$;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS comprovante_pagamento_urls text[] DEFAULT NULL;

-- ── Verificação ──────────────────────────────────────────────
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'comprovantes-pagamento-pedidos';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'pedidos' AND column_name = 'comprovante_pagamento_urls';
