-- ============================================================
-- Fase 6 — Bloco "Finalizado" separado de "Separação"
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Alarga o CHECK de tipo pra incluir 'Separação' (já em uso, mas o
--    constraint do repo nunca foi atualizado — schema já tinha divergido)
--    e o novo 'Finalizado'.
ALTER TABLE producao_linhas DROP CONSTRAINT IF EXISTS producao_linhas_tipo_check;
ALTER TABLE producao_linhas ADD CONSTRAINT producao_linhas_tipo_check
  CHECK (tipo IN ('Corte','Lapidação','Furação','Separação','Finalizado','Outro'));

-- 2. Nova linha virtual "Finalizado" — representa o tempo de espera até o
--    cliente retirar (distinto de "Separação", que é o preparo/embalagem).
INSERT INTO producao_linhas (nome, tipo, cor, capacidade_horas_dia, ativo)
VALUES ('Finalizado', 'Finalizado', '#10b981', 24, true)
ON CONFLICT DO NOTHING;

-- 3. Migra os blocos existentes: a etapa 'Retirada de Chapa' passa a se
--    chamar 'Separação' (mesmo conceito, nome mais claro e consistente
--    com o restante do fluxo Corte → Lapidação → Separação → Finalizado).
UPDATE programacao_producao SET etapa = 'Separação' WHERE etapa = 'Retirada de Chapa';

-- Verificação
SELECT id, nome, tipo FROM producao_linhas ORDER BY id;
SELECT etapa, count(*) FROM programacao_producao GROUP BY etapa ORDER BY etapa;
