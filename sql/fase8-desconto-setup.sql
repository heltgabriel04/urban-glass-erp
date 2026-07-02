-- ============================================================
-- Fase 8 — Registra o desconto de setup economizado pelo motor
-- Execute no Supabase SQL Editor
-- ============================================================

-- Coluna nova: minutos de setup economizados quando o motor de recálculo
-- automático agenda um pedido cujo produto principal repete o do último
-- bloco colocado na mesma linha (duracaoComSetupAdaptativo). Hoje esse
-- desconto só existia durante o cálculo da prévia e se perdia na gravação —
-- essa coluna permite mostrar um número real ao usuário (badge no bloco +
-- agregado no dashboard) em vez de recalcular/estimar depois do fato.
ALTER TABLE programacao_producao
  ADD COLUMN IF NOT EXISTS desconto_setup_min integer DEFAULT 0;

-- Verificação
SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'programacao_producao' AND column_name = 'desconto_setup_min';
