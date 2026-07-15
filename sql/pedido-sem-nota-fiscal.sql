-- Flag manual: pedido vendido sem emissão de nota fiscal (não dá pra inferir isso pelo sistema)
-- Rodar no Supabase SQL Editor

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS sem_nota_fiscal boolean NOT NULL DEFAULT false;
