-- Upload do orçamento assinado pelo cliente após aprovação.
-- Execute no SQL Editor do Supabase.

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS arquivo_assinado_url TEXT;

-- Bucket de armazenamento para os arquivos assinados
INSERT INTO storage.buckets (id, name, public)
VALUES ('orcamentos-assinados', 'orcamentos-assinados', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_select_orc_assinado" ON storage.objects;
CREATE POLICY "auth_select_orc_assinado" ON storage.objects FOR SELECT
  USING (bucket_id = 'orcamentos-assinados' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_insert_orc_assinado" ON storage.objects;
CREATE POLICY "auth_insert_orc_assinado" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'orcamentos-assinados' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_update_orc_assinado" ON storage.objects;
CREATE POLICY "auth_update_orc_assinado" ON storage.objects FOR UPDATE
  USING (bucket_id = 'orcamentos-assinados' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_delete_orc_assinado" ON storage.objects;
CREATE POLICY "auth_delete_orc_assinado" ON storage.objects FOR DELETE
  USING (bucket_id = 'orcamentos-assinados' AND auth.role() = 'authenticated');
