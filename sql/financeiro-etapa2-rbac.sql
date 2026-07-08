-- ─────────────────────────────────────────────────────────
-- ETAPA 2 · Lote I — RBAC aditivo (papel "financeiro")
--
-- ⚠ IMPORTANTE — leia antes de rodar:
-- Este script só estende o enum de papéis (aditivo, sem risco). Ele NÃO
-- aplica nenhuma política RLS restritiva nas tabelas financeiras — isso é
-- proposital. Já existe em scripts/migration-rls-roles.sql um padrão de
-- RLS restrita por papel (admin_write) aplicado a `lancamentos` e outras
-- tabelas, mas ele depende do Custom Access Token Hook do Supabase estar
-- ativo (Authentication → Hooks, no Dashboard) — isso não é verificável
-- por código. Se você aplicar uma política que exige
-- auth.jwt()->>'user_role' = 'admin' SEM confirmar que o hook está ativo,
-- o claim nunca chega no JWT e TODO MUNDO (inclusive admin) fica travado
-- pra fora do financeiro.
--
-- Passo a passo seguro:
--   1. Rode este script agora (só adiciona o papel, não trava nada).
--   2. No Dashboard do Supabase, confirme que o hook está ativo
--      (Authentication → Hooks → Custom Access Token).
--   3. Só depois disso, decida se quer estender o padrão de
--      scripts/migration-rls-roles.sql pras tabelas financeiras novas
--      (contas_bancarias, centros_custo, baixas_lancamento,
--      lancamentos_recorrentes, formas_pagamento, transferencias_bancarias,
--      lancamento_rateio) — isso fica pra quando você confirmar o passo 2.
-- ─────────────────────────────────────────────────────────

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'producao', 'visitante', 'financeiro'));
