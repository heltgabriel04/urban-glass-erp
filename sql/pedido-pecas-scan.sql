-- ============================================================
-- Rastreamento por peça física via QR (sub-projeto #2 de
-- fechamento-lote-producao + Fase 3 do APS/aps.md).
-- Execute no Supabase SQL Editor.
-- Ver docs/superpowers/specs/2026-07-21-scan-real-pecas-design.md
-- ============================================================

-- Uma linha por peça física gerada pelo plano de corte (chapas_json de
-- historico_otimizador). Cada peça recebe QR próprio, escaneado no chão de
-- fábrica pra fechar Corte/Lapidação/Separação por medição real, em vez do
-- carimbo administrativo do avanço de status do pedido (ver
-- sql/programacao-horario-estimado.sql, sub-projeto #1).
CREATE TABLE IF NOT EXISTS pedido_pecas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         text NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  item_pedido_id    bigint REFERENCES itens_pedido(id) ON DELETE SET NULL,
  qr_token          uuid NOT NULL DEFAULT gen_random_uuid(),
  ordem             integer NOT NULL,
  chapa_num         integer NOT NULL,
  largura           numeric NOT NULL,
  altura            numeric NOT NULL,
  precisa_lapidacao boolean NOT NULL DEFAULT true,
  status            text NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente', 'cortada', 'lapidada', 'separada')),
  dt_corte_real       timestamptz,
  dt_lapidacao_real   timestamptz,
  dt_separacao_real   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pedido_pecas_qr_token_key ON pedido_pecas (qr_token);
CREATE INDEX IF NOT EXISTS pedido_pecas_pedido_id_idx ON pedido_pecas (pedido_id);
CREATE INDEX IF NOT EXISTS pedido_pecas_item_pedido_id_idx ON pedido_pecas (item_pedido_id);

-- Verificação
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pedido_pecas' ORDER BY ordinal_position;
