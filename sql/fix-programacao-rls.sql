-- ============================================================
-- Fix: desativa RLS nas tabelas de programação da produção
-- Mesmo padrão usado em fix-pos-financeira-rls.sql
-- Execute no Supabase SQL Editor
-- ============================================================

ALTER TABLE producao_linhas         DISABLE ROW LEVEL SECURITY;
ALTER TABLE config_tempo_producao   DISABLE ROW LEVEL SECURITY;
ALTER TABLE programacao_producao    DISABLE ROW LEVEL SECURITY;
ALTER TABLE programacao_historico   DISABLE ROW LEVEL SECURITY;

-- Garante que os dados de seed existem (re-insere se necessário)
INSERT INTO producao_linhas (nome, tipo, cor, capacidade_horas_dia, ativo) VALUES
  ('Linha 1 – Corte',     'Corte',     '#3dffa0', 8, true),
  ('Linha 2 – Lapidação', 'Lapidação', '#00c8ff', 8, true)
ON CONFLICT DO NOTHING;

INSERT INTO config_tempo_producao
  (etapa, min_por_m2, min_por_peca, min_por_lapidacao, min_por_furo, setup_pedido_min, fator_vidro_especial)
VALUES
  ('Corte',      2.0,  0.5, 0.0, 5.0, 10.0, 1.3),
  ('Lapidação',  0.5,  0.0, 4.0, 0.0,  8.0, 1.2)
ON CONFLICT DO NOTHING;

-- Verificação: deve retornar 2 linhas em cada
SELECT 'producao_linhas'       AS tabela, count(*) FROM producao_linhas        UNION ALL
SELECT 'config_tempo_producao' AS tabela, count(*) FROM config_tempo_producao  UNION ALL
SELECT 'programacao_producao'  AS tabela, count(*) FROM programacao_producao;
