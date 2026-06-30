-- Fix: desativa RLS na tabela estoque_movimentacoes
-- Mesmo padrão de fix-programacao-rls.sql e fix-pos-financeira-rls.sql
-- Execute no Supabase SQL Editor

ALTER TABLE estoque_movimentacoes DISABLE ROW LEVEL SECURITY;

-- Verificação: deve retornar o total de movimentações existentes
SELECT count(*) FROM estoque_movimentacoes;
