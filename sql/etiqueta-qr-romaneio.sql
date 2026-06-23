-- QR estável na etiqueta física: token público não-sequencial por pedido,
-- usado por /api/r/[token] para decidir destino (produção vs romaneio) em
-- tempo de leitura, sem nunca trocar o conteúdo do QR já impresso.
-- Execute no SQL Editor do Supabase.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid();
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS romaneio_pdf_url TEXT;

-- Backfill dos pedidos já existentes (novos já nascem com token via DEFAULT)
UPDATE pedidos SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_qr_token_key ON pedidos (qr_token);

-- Bucket de armazenamento para os romaneios em PDF (leitura pública, sem login)
INSERT INTO storage.buckets (id, name, public)
VALUES ('romaneios', 'romaneios', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_select_romaneios" ON storage.objects;
CREATE POLICY "auth_select_romaneios" ON storage.objects FOR SELECT
  USING (bucket_id = 'romaneios' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_insert_romaneios" ON storage.objects;
CREATE POLICY "auth_insert_romaneios" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'romaneios' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_update_romaneios" ON storage.objects;
CREATE POLICY "auth_update_romaneios" ON storage.objects FOR UPDATE
  USING (bucket_id = 'romaneios' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_delete_romaneios" ON storage.objects;
CREATE POLICY "auth_delete_romaneios" ON storage.objects FOR DELETE
  USING (bucket_id = 'romaneios' AND auth.role() = 'authenticated');
