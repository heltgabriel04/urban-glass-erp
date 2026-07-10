-- Correção de segurança — reabilita RLS em tabelas expostas
--
-- Achado da auditoria crítica de 2026-07-10 (ver artifact publicado):
-- 5 tabelas tiveram RLS desabilitado permanentemente (não como rollback
-- temporário, como "solução" final) via fix-programacao-rls.sql,
-- fix-estoque-movimentacoes-rls.sql e fix-pos-financeira-rls.sql —
-- provavelmente porque foram habilitadas sem nenhuma policy (RLS
-- habilitado sem policy = tabela travada até pro próprio app, mesmo bug
-- já visto na Fase 2 de Contabilidade). Outras 3 (compras, compras_itens,
-- log_atividades) nunca tiveram RLS habilitado.
--
-- Com RLS desligado, a tabela fica exposta até pra chave anônima pública
-- (embutida no bundle do browser) — não é só uma questão de "quem tem
-- login", é proteção zero contra qualquer request externo.
--
-- Política aplicada: mesmo baseline usado no resto do sistema
-- (auth.role() = 'authenticated') — sem RBAC granular por perfil de
-- negócio ainda (isso fica pra depois, por decisão consciente: os
-- usuários autenticados de hoje são todos de confiança). O objetivo
-- aqui é só fechar a exposição a quem NÃO tem login nenhum.
--
-- Rodar no Supabase → SQL Editor. Idempotente.

-- ─── Programação de Produção ────────────────────────────────
ALTER TABLE producao_linhas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_tempo_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE programacao_producao  ENABLE ROW LEVEL SECURITY;
ALTER TABLE programacao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_producao   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueios_linha       ENABLE ROW LEVEL SECURITY;

-- ─── Estoque ────────────────────────────────────────────────
ALTER TABLE estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

-- ─── Financeiro ─────────────────────────────────────────────
ALTER TABLE pos_financeira        ENABLE ROW LEVEL SECURITY;

-- ─── Compras (nunca teve RLS) ───────────────────────────────
ALTER TABLE compras               ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_itens         ENABLE ROW LEVEL SECURITY;

-- ─── Auditoria (nunca teve RLS — a própria trilha de log) ───
ALTER TABLE log_atividades        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  tabelas_sem_delete text[] := ARRAY[
    'producao_linhas', 'config_tempo_producao', 'programacao_historico',
    'calendario_producao', 'pos_financeira', 'log_atividades'
  ];
  tabelas_com_delete text[] := ARRAY[
    'programacao_producao', 'bloqueios_linha', 'estoque_movimentacoes',
    'compras', 'compras_itens'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas_sem_delete || tabelas_com_delete LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY "auth_select" ON %I FOR SELECT USING (auth.role() = ''authenticated'')', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY "auth_insert" ON %I FOR INSERT WITH CHECK (auth.role() = ''authenticated'')', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY "auth_update" ON %I FOR UPDATE USING (auth.role() = ''authenticated'')', t);
    END IF;
  END LOOP;

  -- DELETE só nas tabelas onde o app de fato usa .delete() hoje
  FOREACH t IN ARRAY tabelas_com_delete LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY "auth_delete" ON %I FOR DELETE USING (auth.role() = ''authenticated'')', t);
    END IF;
  END LOOP;
END $$;

-- Verificação: todas devem aparecer com rowsecurity = true
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN (
  'producao_linhas','config_tempo_producao','programacao_producao','programacao_historico',
  'calendario_producao','bloqueios_linha','estoque_movimentacoes','pos_financeira',
  'compras','compras_itens','log_atividades'
)
ORDER BY tablename;
