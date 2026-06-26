-- Vincula cada uso de retalho a um item específico do pedido.
-- Rodar no Supabase SQL Editor.

ALTER TABLE retalhos_uso
ADD COLUMN IF NOT EXISTS item_pedido_id integer REFERENCES itens_pedido(id) ON DELETE SET NULL;
