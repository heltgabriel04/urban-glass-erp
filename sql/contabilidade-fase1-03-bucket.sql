-- Módulo Contabilidade — Fase 1
-- Bucket único para anexos de documentos fiscais e itens de checklist
-- (separados por prefixo de path: documentos/${id}/... , checklist/${id}/...).
-- Rodar no Supabase → SQL Editor.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('contabilidade-anexos', 'contabilidade-anexos', true, 20971520)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contabilidade public read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "contabilidade public read" ON storage.objects FOR SELECT USING (bucket_id = 'contabilidade-anexos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contabilidade auth insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "contabilidade auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'contabilidade-anexos' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contabilidade auth delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "contabilidade auth delete" ON storage.objects FOR DELETE USING (bucket_id = 'contabilidade-anexos' AND auth.role() = 'authenticated');
  END IF;
END $$;
