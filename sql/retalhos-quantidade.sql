-- Adiciona campo quantidade aos retalhos.
-- Rodar no Supabase SQL Editor.

ALTER TABLE retalhos ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1;
