-- ─────────────────────────────────────────────────────────
-- Etapa 5.5 · Widgets configuráveis — Dashboard Financeiro
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_widget_config (
  user_id     uuid NOT NULL,
  nivel       text NOT NULL,
  widget_key  text NOT NULL,
  visivel     boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, nivel, widget_key)
);

ALTER TABLE dashboard_widget_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dashboard_widget_config_own" ON dashboard_widget_config;
-- Cada usuário só lê/escreve a própria configuração — diferente do resto
-- do financeiro (que é compartilhado entre todo mundo autenticado), isso
-- aqui é preferência pessoal de tela.
CREATE POLICY "dashboard_widget_config_own" ON dashboard_widget_config
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
