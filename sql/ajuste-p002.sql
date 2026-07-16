-- Ajuste pontual de dados — pedido P-002
-- Problema: 2 lançamentos "A Receber" órfãos (parcelas 1/2 e 2/2, criados na
-- venda original) nunca foram baixados nem removidos depois que o pedido foi
-- marcado como pago por um lançamento avulso "Recebimento pedido P-002"
-- (id 30, R$ 8.300,00, status Pago — bate exatamente com valor_total).
-- Resultado: pedido aparece "Quitado ✓" (valor_recebido já soma R$ 8.300,00
-- via o lançamento id 30), mas os 2 lançamentos "A Receber" continuam
-- aparecendo em Contas a Receber, pois essa tela lê status por linha, não o
-- agregado do pedido.
--
-- Não tiveram baixa nenhuma (nunca foram marcados como pagos) — remoção
-- definitiva, sem histórico de pagamento a preservar. Confirmado antes de
-- rodar: id 28 = "Parcela 1/2 · P-002" R$ 7.500,00 + id 29 = "Parcela 2/2 ·
-- P-002" R$ 800,00 = R$ 8.300,00 = valor_total do pedido.
--
-- Guardas: casa por id E status='A Receber' E pedido_id='P-002' — se algum
-- dos dois já tiver mudado de status (ex: alguém já mexeu manualmente),
-- a linha correspondente simplesmente não é afetada.

DELETE FROM lancamentos
 WHERE id IN (28, 29)
   AND status = 'A Receber'
   AND pedido_id = 'P-002';

-- Verificação (deve retornar só o lançamento id 30, "Pago")
SELECT id, descricao, valor, status, vencimento, pedido_id
FROM   lancamentos
WHERE  pedido_id = 'P-002'
ORDER  BY created_at;

-- Confirma que o pedido continua quitado (não deveria mudar nada aqui —
-- os 2 lançamentos removidos já não contavam pra valor_recebido)
SELECT id, valor_total, valor_recebido FROM pedidos WHERE id = 'P-002';
