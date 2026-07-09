-- Módulo Contabilidade — Fase 1
-- Fechamento mensal + checklist. Itens de fases futuras (estoque, ativo
-- imobilizado, cartões/empréstimos/consórcios) nascem como 'nao_aplicavel'
-- e não contam como pendência — o catálogo de itens fica em código
-- (lib/contabilidadeChecklist.ts), não nesta tabela.
-- Rodar no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS contabilidade_fechamentos (
  id               bigserial PRIMARY KEY,
  competencia_ano  int NOT NULL,
  competencia_mes  int NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  status           text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','concluido')),
  percentual       int NOT NULL DEFAULT 0,  -- 0/25/50/75/100
  concluido_em     timestamptz,
  concluido_por    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competencia_ano, competencia_mes)
);

CREATE TABLE IF NOT EXISTS contabilidade_checklist_itens (
  id             bigserial PRIMARY KEY,
  fechamento_id  bigint NOT NULL REFERENCES contabilidade_fechamentos(id) ON DELETE CASCADE,
  item_key       text NOT NULL,
  status         text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido','nao_aplicavel')),
  data_conclusao date,
  responsavel    text,
  observacao     text,
  anexos         text[],
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fechamento_id, item_key)
);

ALTER TABLE contabilidade_fechamentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidade_checklist_itens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_fech' AND tablename = 'contabilidade_fechamentos') THEN
    CREATE POLICY "auth_all_fech" ON contabilidade_fechamentos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_item' AND tablename = 'contabilidade_checklist_itens') THEN
    CREATE POLICY "auth_all_item" ON contabilidade_checklist_itens FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
