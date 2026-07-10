-- Correção de integridade — retrabalho passa a gerar lançamento financeiro
--
-- Achado da auditoria crítica de 2026-07-10: custo_adicional de retrabalho
-- nunca virava lançamento financeiro (número digitado sem efeito real no
-- CMV/resultado). Segue o mesmo padrão de quebras.baixa_estoque: um flag
-- pra não gerar o lançamento duas vezes se o retrabalho for reaberto e
-- concluído de novo.
--
-- Rodar no Supabase → SQL Editor. Idempotente.

ALTER TABLE retrabalhos
  ADD COLUMN IF NOT EXISTS lancamento_gerado boolean NOT NULL DEFAULT false;
