-- Módulo Contabilidade — Fase 6
-- Ativa o item "Financeiro (Contas a Pagar/Receber)" do checklist nos
-- fechamentos que já existiam ANTES da Fase 6 (nasceram como
-- 'nao_aplicavel'). Fechamentos NOVOS já nascem com o item correto —
-- isso só corrige o passado. Só mexe em fechamentos ainda 'aberto' (não
-- reabre pendência num mês já concluído).
--
-- IMPORTANTE: rodar DEPOIS do deploy do código que muda FASE_ATUAL para 6
-- em lib/contabilidadeChecklist.ts — ordem importa.
-- Idempotente — rodar de novo não faz nada na segunda vez.

UPDATE contabilidade_checklist_itens ci
SET status = 'pendente', updated_at = now()
FROM contabilidade_fechamentos f
WHERE ci.fechamento_id = f.id
  AND ci.item_key = 'financeiro'
  AND ci.status = 'nao_aplicavel'
  AND f.status = 'aberto';
