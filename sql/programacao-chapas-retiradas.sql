-- ============================================================
-- Retiradas parciais de produção + linha de Separação
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela para rastrear peças retiradas progressivamente durante a produção
CREATE TABLE IF NOT EXISTS programacao_retiradas (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  programacao_id  uuid    NOT NULL REFERENCES programacao_producao(id) ON DELETE CASCADE,
  pedido_id       text    NOT NULL,
  dt_retirada     date    NOT NULL DEFAULT CURRENT_DATE,
  pecas_retiradas integer NOT NULL CHECK (pecas_retiradas > 0),
  obs             text,
  created_at      timestamp with time zone DEFAULT now()
);

ALTER TABLE programacao_retiradas DISABLE ROW LEVEL SECURITY;

-- Linha virtual de Separação para pedidos de chapa inteira (sem corte)
INSERT INTO producao_linhas (nome, tipo, cor, capacidade_horas_dia, ativo)
VALUES ('Separação', 'Separação', '#a78bfa', 12, true)
ON CONFLICT DO NOTHING;

-- Verificação
SELECT id, nome, tipo FROM producao_linhas ORDER BY id;
SELECT 'programacao_retiradas criada' AS status;
