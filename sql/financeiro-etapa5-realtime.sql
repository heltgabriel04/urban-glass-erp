-- ─────────────────────────────────────────────────────────
-- Etapa 5.5 · Tempo real — Dashboard Financeiro
-- Rodar no SQL Editor do Supabase.
--
-- ⚠ Depois de rodar, confirme em Database → Replication no painel do
-- Supabase que "lancamentos" e "baixas_lancamento" aparecem com Realtime
-- habilitado. Isso não é verificável por código — se não aparecer lá,
-- o dashboard simplesmente não atualiza sozinho (sem erro, sem travar).
-- ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lancamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'baixas_lancamento'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE baixas_lancamento;
  END IF;
END $$;
