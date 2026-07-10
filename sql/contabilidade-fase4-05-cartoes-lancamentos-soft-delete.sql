-- Módulo Contabilidade — Fase 4 (correção)
-- cartoes_lancamentos foi criada com policy de DELETE físico de verdade
-- (justificado no plano original como "não é um ledger de saldo"), mas
-- isso contraria a regra do módulo inteiro: nada é apagado de fato,
-- tudo é soft-delete (mesmo padrão de documentos_fiscais, Fase 1).
-- Rodar no Supabase → SQL Editor.
-- Idempotente — rodar de novo não faz nada na segunda vez.

ALTER TABLE cartoes_lancamentos
  ADD COLUMN IF NOT EXISTS deletado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS deletado_por   text,
  ADD COLUMN IF NOT EXISTS motivo_exclusao text;

DROP POLICY IF EXISTS "auth_delete" ON cartoes_lancamentos;
