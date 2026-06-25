-- Migração: renomeia status "Aguardando otimização" → "Planejamento"
-- e adiciona campo para PDFs do Corte Certo.
-- Rodar no Supabase SQL Editor.

UPDATE pedidos
SET status = 'Planejamento'
WHERE status = 'Aguardando otimização';

ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS corte_certo_urls text[] DEFAULT '{}';
