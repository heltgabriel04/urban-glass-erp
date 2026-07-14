-- Cartões Corporativos — ponte com lancamentos reais
-- Fatura de crédito fechada e compra de débito sem fatura passam a gerar
-- um lançamento de verdade em `lancamentos` (hoje o gasto no cartão
-- corporativo é invisível pro DRE/Contas a Pagar/Fluxo de Caixa — existe
-- só dentro do módulo Cartões). Colunas aditivas, sem retroativo.
-- Rodar no Supabase → SQL Editor.

ALTER TABLE cartoes_faturas ADD COLUMN IF NOT EXISTS lancamento_id int REFERENCES lancamentos(id);
ALTER TABLE cartoes_lancamentos ADD COLUMN IF NOT EXISTS lancamento_id int REFERENCES lancamentos(id);
