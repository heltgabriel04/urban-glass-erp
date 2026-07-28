-- Backfill de dt_pagamento — lançamentos marcados como pagos pela tela do
-- pedido antes da correção de app/pedidos/[id]/page.tsx.
--
-- Problema: handleMarcarPago / handleSalvarEdicaoPago (tela do pedido)
-- sempre gravaram a data digitada no campo `vencimento`, nunca em
-- `dt_pagamento`. Resultado: Contas a Receber (que lê dt_pagamento pra
-- mostrar a coluna "Recebimento") aparecia em branco pra todo pagamento
-- feito por essa tela — mesmo o pedido estando de fato pago.
--
-- Universo afetado: TODOS os lançamentos com status='Pago', sem nenhuma
-- baixa em baixas_lancamento (ou seja, pagos pelo fluxo antigo da tela do
-- pedido, não pelo "Registrar Baixa" de Contas a Receber/Pagar, que já
-- grava dt_pagamento corretamente) e com dt_pagamento ainda NULL.
-- Confirmado antes de rodar: 27 lançamentos nessa condição, 0 com baixa
-- registrada, 0 já com dt_pagamento preenchido — ou seja, o filtro abaixo
-- não corre risco de sobrescrever nada que já esteja correto.
--
-- Para esses casos, `vencimento` É a data real do pagamento (foi
-- sobrescrita pela tela do pedido no momento de marcar como pago), então
-- o backfill correto é dt_pagamento = vencimento.

-- Preview (rode antes pra conferir a lista — mesma que foi validada)
SELECT id, pedido_id, valor, vencimento, dt_pagamento
FROM   lancamentos
WHERE  status = 'Pago'
  AND  deletado_em IS NULL
  AND  dt_pagamento IS NULL
  AND  NOT EXISTS (
        SELECT 1 FROM baixas_lancamento b WHERE b.lancamento_id = lancamentos.id
       )
ORDER  BY vencimento;

-- Backfill
UPDATE lancamentos
SET    dt_pagamento = vencimento
WHERE  status = 'Pago'
  AND  deletado_em IS NULL
  AND  dt_pagamento IS NULL
  AND  NOT EXISTS (
        SELECT 1 FROM baixas_lancamento b WHERE b.lancamento_id = lancamentos.id
       );

-- Verificação (deve retornar 0 linhas)
SELECT id, pedido_id, valor, vencimento, dt_pagamento
FROM   lancamentos
WHERE  status = 'Pago'
  AND  deletado_em IS NULL
  AND  dt_pagamento IS NULL
  AND  NOT EXISTS (
        SELECT 1 FROM baixas_lancamento b WHERE b.lancamento_id = lancamentos.id
       );
