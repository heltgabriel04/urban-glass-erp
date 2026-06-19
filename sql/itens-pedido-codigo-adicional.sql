-- Código adicional por peça (usado quando o cliente fornece uma planilha própria
-- de medidas com um código por vidro, ex.: pedido P-051)
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS codigo_adicional text;
