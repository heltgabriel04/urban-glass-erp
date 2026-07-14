-- CRM — Painel do Cliente
-- Registro de interações comerciais (ligação/e-mail/reunião/nota) por
-- cliente, com lembrete opcional de próximo contato — o follow-up
-- atrasado é calculado em runtime e exibido só na própria página do
-- cliente, sem alerta em outro lugar do sistema.
-- Sem vínculo a usuário logado, sem soft-delete, sem UPDATE (só criar/
-- excluir) — decisões confirmadas na spec.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS interacoes_cliente (
  id               bigserial PRIMARY KEY,
  cliente_id       bigint NOT NULL REFERENCES clientes(id),
  tipo             text NOT NULL CHECK (tipo IN ('ligacao','email','reuniao','nota')),
  data             timestamptz NOT NULL DEFAULT now(),
  descricao        text NOT NULL,
  proximo_contato  date,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_cliente ON interacoes_cliente (cliente_id);

ALTER TABLE interacoes_cliente ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'interacoes_cliente') THEN
    CREATE POLICY "auth_select" ON interacoes_cliente FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'interacoes_cliente') THEN
    CREATE POLICY "auth_insert" ON interacoes_cliente FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete' AND tablename = 'interacoes_cliente') THEN
    CREATE POLICY "auth_delete" ON interacoes_cliente FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;
-- Sem policy de UPDATE: interação não é editável depois de criada (spec).
