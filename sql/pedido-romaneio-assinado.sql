-- Upload do(s) romaneio(s) assinado(s) pelo cliente/motorista na entrega.
-- Array porque um pedido com várias retiradas pode acumular vários
-- romaneios assinados, um por viagem.
-- Execute no SQL Editor do Supabase.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS romaneio_assinado_urls TEXT[];

-- Bucket de armazenamento para os romaneios assinados
INSERT INTO storage.buckets (id, name, public)
VALUES ('romaneios-assinados', 'romaneios-assinados', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_select_romaneio_assinado" ON storage.objects;
CREATE POLICY "auth_select_romaneio_assinado" ON storage.objects FOR SELECT
  USING (bucket_id = 'romaneios-assinados' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_insert_romaneio_assinado" ON storage.objects;
CREATE POLICY "auth_insert_romaneio_assinado" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'romaneios-assinados' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_update_romaneio_assinado" ON storage.objects;
CREATE POLICY "auth_update_romaneio_assinado" ON storage.objects FOR UPDATE
  USING (bucket_id = 'romaneios-assinados' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_delete_romaneio_assinado" ON storage.objects;
CREATE POLICY "auth_delete_romaneio_assinado" ON storage.objects FOR DELETE
  USING (bucket_id = 'romaneios-assinados' AND auth.role() = 'authenticated');
