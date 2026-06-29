-- ============================================================
-- Módulo de Programação da Produção (APS Simplificado)
-- Urban Glass ERP — Execute no Supabase SQL Editor
-- ============================================================

-- 1. Linhas / Máquinas de produção
CREATE TABLE IF NOT EXISTS producao_linhas (
  id                   SERIAL  PRIMARY KEY,
  nome                 TEXT    NOT NULL,
  tipo                 TEXT    NOT NULL CHECK (tipo IN ('Corte','Lapidação','Furação','Outro')),
  inicio_dia           TIME    NOT NULL DEFAULT '08:00:00',
  fim_dia              TIME    NOT NULL DEFAULT '17:00:00',
  capacidade_horas_dia NUMERIC NOT NULL DEFAULT 8,
  cor                  TEXT    NOT NULL DEFAULT '#3dffa0',
  ativo                BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- 2. Parâmetros de tempo por etapa (calibráveis pelo usuário)
CREATE TABLE IF NOT EXISTS config_tempo_producao (
  etapa                TEXT    PRIMARY KEY,
  min_por_m2           NUMERIC NOT NULL DEFAULT 2.5,
  min_por_peca         NUMERIC NOT NULL DEFAULT 1.0,
  min_por_lapidacao    NUMERIC NOT NULL DEFAULT 4.0,
  min_por_furo         NUMERIC NOT NULL DEFAULT 5.0,
  setup_pedido_min     NUMERIC NOT NULL DEFAULT 10.0,
  fator_vidro_especial NUMERIC NOT NULL DEFAULT 1.3,
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- 3. Programação principal (1 registro por pedido × etapa × linha)
CREATE TABLE IF NOT EXISTS programacao_producao (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id            TEXT    NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  linha_id             INT     REFERENCES producao_linhas(id),
  etapa                TEXT    NOT NULL,
  sequencia            INT     NOT NULL DEFAULT 0,
  dt_inicio_previsto   TIMESTAMPTZ,
  dt_fim_previsto      TIMESTAMPTZ,
  duracao_estimada_min INT,
  dt_inicio_real       TIMESTAMPTZ,
  dt_fim_real          TIMESTAMPTZ,
  status               TEXT    NOT NULL DEFAULT 'Agendado'
                         CHECK (status IN ('Agendado','Em Execução','Concluído','Cancelado')),
  responsavel          TEXT,
  obs                  TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- 4. Histórico de reprogramações (auditoria completa)
CREATE TABLE IF NOT EXISTS programacao_historico (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programacao_id   UUID REFERENCES programacao_producao(id) ON DELETE SET NULL,
  pedido_id        TEXT REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario          TEXT,
  tipo_alteracao   TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos      JSONB,
  motivo           TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prog_pedido   ON programacao_producao(pedido_id);
CREATE INDEX IF NOT EXISTS idx_prog_linha_dt ON programacao_producao(linha_id, dt_inicio_previsto);
CREATE INDEX IF NOT EXISTS idx_prog_status   ON programacao_producao(status);
CREATE INDEX IF NOT EXISTS idx_prog_hist_ped ON programacao_historico(pedido_id);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_prog_updated_at ON programacao_producao;
CREATE TRIGGER trg_prog_updated_at
  BEFORE UPDATE ON programacao_producao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed: linhas de produção iniciais
INSERT INTO producao_linhas (nome, tipo, cor, capacidade_horas_dia) VALUES
  ('Linha 1 – Corte',      'Corte',     '#3dffa0', 8),
  ('Linha 2 – Lapidação',  'Lapidação', '#00c8ff', 8)
ON CONFLICT DO NOTHING;

-- Seed: configuração de tempo padrão
-- min_por_m2: minutos por m² na máquina
-- min_por_peca: setup extra por peça (posicionamento)
-- min_por_lapidacao: minutos por peça que tem lapidação
-- setup_pedido_min: tempo fixo de setup por pedido (ligar máquina, ajustar)
-- fator_vidro_especial: multiplicador para temperado/laminado/espelho
INSERT INTO config_tempo_producao
  (etapa, min_por_m2, min_por_peca, min_por_lapidacao, min_por_furo, setup_pedido_min, fator_vidro_especial)
VALUES
  ('Corte',      2.0,  0.5, 0.0, 5.0, 10.0, 1.3),
  ('Lapidação',  0.5,  0.0, 4.0, 0.0,  8.0, 1.2)
ON CONFLICT DO NOTHING;
