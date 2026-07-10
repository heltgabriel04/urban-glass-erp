-- Correção de risco físico — trava de rotação no otimizador de corte
--
-- Achado da auditoria crítica de 2026-07-10: o otimizador de corte
-- (lib/otimizador.ts) rotacionava qualquer peça de vidro livremente, sem
-- nenhuma trava configurável — risco real de peça sair errada em vidro
-- direcional, com padrão ou serigrafado.
--
-- Campo por produto (é a bandeira/tipo de vidro que tem ou não um padrão
-- direcional, não o pedido/item específico). Default TRUE preserva o
-- comportamento atual pra todo produto já cadastrado.
--
-- Rodar no Supabase → SQL Editor. Idempotente.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS pode_rotacionar boolean NOT NULL DEFAULT true;
