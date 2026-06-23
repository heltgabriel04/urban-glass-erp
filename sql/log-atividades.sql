-- Recria a tabela log_atividades. Ela não existe (ou não está visível pro
-- PostgREST) na instância atual do Supabase, por isso todo o histórico de
-- atividades — criar/editar/excluir pedido, avançar status, etc, em
-- qualquer módulo — vem falhando silenciosamente em leitura E escrita
-- desde sempre (ver app/api/logs/route.ts e services/log.service.ts).
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS log_atividades (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  usuario_id       uuid,
  usuario_email    text,
  acao             text NOT NULL,
  tabela           text NOT NULL,
  registro_id      text,
  descricao        text NOT NULL,
  campos_alterados jsonb
);

CREATE INDEX IF NOT EXISTS log_atividades_created_at_idx ON log_atividades (created_at DESC);
CREATE INDEX IF NOT EXISTS log_atividades_tabela_idx      ON log_atividades (tabela);

-- Sem RLS/policies de propósito: a tabela só é acessada via service_role
-- pela rota /api/logs (mesmo critério já documentado em
-- scripts/migration-rls-baseline.sql).
