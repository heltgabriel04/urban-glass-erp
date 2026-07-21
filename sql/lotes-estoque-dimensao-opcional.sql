-- ============================================================
-- lotes_estoque — ajuste: dimensão pode ser desconhecida na migração
-- Execute no Supabase SQL Editor, DEPOIS de sql/lotes-estoque.sql
-- (já confirmado rodado).
-- ============================================================
--
-- Os 5 lotes migrados de `estoque` (produto_id 10, 13, 15, 17, 21) não
-- têm largura/altura confirmada — só o m2_por_chapa antigo, que não é
-- suficiente pra reconstruir L×A com segurança (infinitas combinações de
-- L×A geram o mesmo m²; 2 dos 5 nem batem com o default hardcoded
-- 3300×2250 que o resto do sistema assumia até aqui). NULL explícito em
-- vez de herdar um chute.
--
-- Mesmo raciocínio aplicado a origem_mercadoria: `estoque` era um saldo
-- agregado por produto, sem rastro de qual(is) compra(s)/CST originaram
-- cada chapa — não dá pra saber se o saldo atual é nacional, importado, ou
-- uma mistura dos dois ao longo do tempo. Também vira NULL pros 5 lotes
-- migrados (só passa a ser obrigatório em lotes novos, que já nascem
-- ligados a uma nota/origem conhecida — caso do lote da importação em
-- sql/lotes-estoque-dados-iniciais.sql).

ALTER TABLE lotes_estoque ALTER COLUMN chapa_largura_mm DROP NOT NULL;
ALTER TABLE lotes_estoque ALTER COLUMN chapa_altura_mm DROP NOT NULL;
ALTER TABLE lotes_estoque ALTER COLUMN origem_mercadoria DROP NOT NULL;

ALTER TABLE lotes_estoque
  ADD COLUMN IF NOT EXISTS dimensao_confirmada boolean NOT NULL DEFAULT false;

-- ── Verificação ──────────────────────────────────────────────
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name = 'lotes_estoque'
--   AND column_name IN ('chapa_largura_mm','chapa_altura_mm','origem_mercadoria','dimensao_confirmada');
