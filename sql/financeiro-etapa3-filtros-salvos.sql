-- ─────────────────────────────────────────────────────────
-- ETAPA 3 · Filtros salvos / favoritos
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS filtros_salvos (
  id             serial PRIMARY KEY,
  usuario_email  text NOT NULL,
  tela           text NOT NULL,
  nome           text NOT NULL,
  filtros        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filtros_salvos_tela ON filtros_salvos (tela, usuario_email);

ALTER TABLE filtros_salvos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'filtros_salvos all authenticated' AND tablename = 'filtros_salvos') THEN
    CREATE POLICY "filtros_salvos all authenticated" ON filtros_salvos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
