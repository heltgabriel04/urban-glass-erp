-- Remove centro de custo e rateio por completo. Decisão do usuário: fábrica
-- única, o cliente já é o corte mais útil de análise, centro de custo não
-- agrega. O código que usava isso (rateio de lançamento, filtros, telas) já
-- foi removido; este script tira a estrutura do banco.
--
-- ATENÇÃO: isso apaga qualquer valor já lançado em centro_custo_id e todo o
-- histórico de rateio. Se quiser conferir antes de rodar, veja o que existe:
--   select count(*) from lancamentos where centro_custo_id is not null;
--   select count(*) from lancamentos_recorrentes where centro_custo_id is not null;
--   select count(*) from lancamento_rateio;

DROP TABLE IF EXISTS lancamento_rateio;

ALTER TABLE lancamentos DROP COLUMN IF EXISTS centro_custo_id;
ALTER TABLE lancamentos_recorrentes DROP COLUMN IF EXISTS centro_custo_id;

DROP TABLE IF EXISTS centros_custo;
