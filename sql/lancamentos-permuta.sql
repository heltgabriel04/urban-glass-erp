-- Flag de permuta por parcela — controle informativo apenas
--
-- Pedido do usuário: marcar uma parcela como "permuta" (paga em troca de
-- produto/serviço, não em dinheiro) sem que isso altere valor_recebido do
-- pedido nem os totais de "a receber" em nenhum relatório. É só uma tag
-- pra filtro/visualização; nenhuma lógica de cálculo financeiro lê essa
-- coluna.
--
-- Rodar no Supabase → SQL Editor. Idempotente.

ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS permuta boolean NOT NULL DEFAULT false;
