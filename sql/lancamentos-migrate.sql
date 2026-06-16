-- Adiciona colunas de Contas a Pagar/Receber ao lancamentos
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS plano_contas_id int REFERENCES plano_contas(id) ON DELETE SET NULL;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS documento    text;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS dt_emissao   date;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS dt_pagamento date;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fornecedor   text;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS obs          text;
