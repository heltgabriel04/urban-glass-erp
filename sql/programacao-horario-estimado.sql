-- ============================================================
-- Fechamento em lote corrompendo dados reais de produção
-- Execute no Supabase SQL Editor
-- Ver docs/superpowers/specs/2026-07-20-fechamento-lote-producao-design.md
-- ============================================================

-- 1. Coluna nova: true = dt_inicio_real/dt_fim_real vieram de um carimbo
-- administrativo (avanço de status do pedido em reconciliarProgramacaoComPedido,
-- que marca TODOS os blocos em aberto daquele pedido/etapa de uma vez), não de
-- uma ação real e deliberada naquele bloco específico (atualizarStatusProgramacao,
-- clique direto no Gantt). Fase 4 (calibração de tempos) passa a ignorar essas
-- linhas.
ALTER TABLE programacao_producao
  ADD COLUMN IF NOT EXISTS horario_real_estimado boolean NOT NULL DEFAULT false;

-- 2. Backfill dos dados já gravados antes desse fix. Como o histórico não
-- guarda qual caminho de código escreveu cada linha, usa a assinatura real do
-- bug: entre blocos concluídos com granularidade de item, marca como estimado
-- todo bloco que tenha outro bloco do MESMO pedido+etapa com dt_fim_real a
-- menos de 60s de distância (reconciliarProgramacaoComPedido roda vários
-- updates sequenciais num único loop — mesmo um pedido grande fecha em
-- segundos). Pedidos de 1 item só não são detectáveis por essa assinatura
-- (um carimbo em lote isolado é indistinguível de um clique real) e ficam
-- deliberadamente de fora — não é uma tentativa de adivinhar.
UPDATE programacao_producao p
SET horario_real_estimado = true
WHERE p.status = 'Concluído'
  AND p.item_pedido_id IS NOT NULL
  AND p.dt_fim_real IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM programacao_producao q
    WHERE q.id <> p.id
      AND q.pedido_id = p.pedido_id
      AND q.etapa = p.etapa
      AND q.item_pedido_id IS NOT NULL
      AND q.dt_fim_real IS NOT NULL
      AND abs(extract(epoch FROM (q.dt_fim_real - p.dt_fim_real))) < 60
  );

-- Verificação
SELECT
  count(*) FILTER (WHERE horario_real_estimado)                              AS marcados_estimado,
  count(*) FILTER (WHERE NOT horario_real_estimado AND dt_fim_real IS NOT NULL) AS mantidos_como_real
FROM programacao_producao;
