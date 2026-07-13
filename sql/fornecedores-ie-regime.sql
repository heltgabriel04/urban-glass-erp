-- Fornecedores — Inscrição Estadual + Regime Tributário
-- Aditiva, todas as colunas com default seguro — não afeta os
-- fornecedores existentes. Idempotente (add column if not exists).

alter table fornecedores
  add column if not exists ie text default '',
  add column if not exists ind_ie text default '9' check (ind_ie in ('1','2','9')),
  add column if not exists regime_tributario text check (regime_tributario in ('mei','simples','presumido','real'));
