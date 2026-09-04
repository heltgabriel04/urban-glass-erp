-- Adiciona campo de observação livre por item/peça do pedido.
-- Motivação (2026-09-04): P-054 (Brasil Temper) teve um problema de
-- vidros errados e o cliente mandou uma planilha de conferência
-- peça-a-peça com notas por vidro ("TRAZER VIDRO", "TEVE ACRÉSCIMO POR
-- QUEBRA", "SOMENTE LAPIDAÇÃO", etc.) — o sistema só tinha um campo de
-- observação por PEDIDO inteiro, não por item. Este campo passa a existir
-- pra qualquer pedido, não só o P-054.
--
-- Sem valor default, nullable — pedidos/itens existentes ficam com obs
-- NULL (equivalente a "sem observação"), sem quebrar nada.

ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS obs text;

COMMENT ON COLUMN itens_pedido.obs IS 'Observação livre por item/peça (ex.: "trazer vidro", "teve acréscimo por quebra")';
