-- Módulo Contabilidade — Fase 3
-- Ativa o item "Ativo Imobilizado" do checklist nos fechamentos que já
-- existiam ANTES da Fase 3 (nasceram como 'nao_aplicavel'). Fechamentos
-- NOVOS já nascem com o item correto — isso só corrige o passado. Só
-- mexe em fechamentos ainda 'aberto' (não reabre pendência num mês já
-- concluído).
--
-- IMPORTANTE: rodar DEPOIS do deploy do código que muda FASE_ATUAL para 3
-- em lib/contabilidadeChecklist.ts — ordem importa.
-- Idempotente — rodar de novo não faz nada na segunda vez.

UPDATE contabilidade_checklist_itens ci
SET status = 'pendente', updated_at = now()
FROM contabilidade_fechamentos f
WHERE ci.fechamento_id = f.id
  AND ci.item_key = 'ativo_imobilizado'
  AND ci.status = 'nao_aplicavel'
  AND f.status = 'aberto';
