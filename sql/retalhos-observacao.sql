-- Adiciona campo de observação/cliente nos retalhos.
-- Usado para indicar quando o vidro pertence a um cliente específico.
ALTER TABLE retalhos ADD COLUMN IF NOT EXISTS observacao text;
