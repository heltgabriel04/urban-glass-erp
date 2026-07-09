-- Campo "Frete" em pedidos (Retirada / Fretado), espelhando o campo que
-- já existe em orçamentos. Rodar no SQL Editor do Supabase.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS frete TEXT NOT NULL DEFAULT 'Retirada';
