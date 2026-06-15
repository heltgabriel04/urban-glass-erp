-- ================================================================
-- MIGRAÇÃO: Bucket de Storage para Fotos de NCs
-- Urban Glass ERP — Rodar no Supabase SQL Editor
-- ================================================================

-- Cria o bucket público para fotos de Não Conformidades
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nc-fotos',
  'nc-fotos',
  true,
  5242880,  -- 5 MB por arquivo
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Política: usuários autenticados podem fazer upload
CREATE POLICY "Autenticados podem enviar fotos NC"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nc-fotos');

-- Política: fotos são públicas para leitura
CREATE POLICY "Fotos NC são públicas"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'nc-fotos');

-- Política: usuários autenticados podem deletar
CREATE POLICY "Autenticados podem deletar fotos NC"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'nc-fotos');
