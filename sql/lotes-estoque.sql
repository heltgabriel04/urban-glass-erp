-- ============================================================
-- lotes_estoque — 1º passo da migração do modelo de estoque de
-- vidro pra múltiplos lotes por produto, cada um com sua própria
-- dimensão de chapa (hoje a dimensão é hardcoded em lib/chapas.ts
-- e app/pedidos/novo/CHAPAS_DIMS, nunca lida do banco; produtos.
-- chapa_largura_mm/altura_mm existe mas está null em 100% dos 11
-- produtos ativos). Migração sem tabela de compatibilidade
-- temporária — troca direta, sem fallback duplo.
-- Execute no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS lotes_estoque (
  id                     bigserial PRIMARY KEY,
  produto_id             bigint NOT NULL REFERENCES produtos(id),
  origem_tipo            text NOT NULL,
  origem_id              text REFERENCES compras(id),
  -- CST origem da mercadoria (só os 2 valores relevantes aqui):
  -- '0' = nacional, '2' = estrangeira (importação direta). Nullable —
  -- lote migrado de um saldo agregado antigo pode não ter essa info (ver
  -- sql/lotes-estoque-dimensao-opcional.sql).
  origem_mercadoria      char(1) CHECK (origem_mercadoria IN ('0', '2')),
  -- Nullable — nem todo lote nasce com dimensão confirmada (ver
  -- dimensao_confirmada abaixo e sql/lotes-estoque-dimensao-opcional.sql).
  chapa_largura_mm       numeric,
  chapa_altura_mm        numeric,
  pode_rotacionar        boolean NOT NULL DEFAULT true,
  chapas_entrada         integer NOT NULL DEFAULT 0,
  chapas_saldo           integer NOT NULL DEFAULT 0,
  -- Gerada — nunca diverge de largura×altura (motivo direto desta migração:
  -- dimensão e m²/chapa não podem viver desalinhados de novo).
  m2_por_chapa           numeric GENERATED ALWAYS AS (chapa_largura_mm * chapa_altura_mm / 1000000) STORED,
  m2_saldo               numeric NOT NULL DEFAULT 0,
  custo_m2               numeric,
  dt_entrada             date NOT NULL DEFAULT CURRENT_DATE,
  estoque_minimo_chapas  numeric NOT NULL DEFAULT 0,
  ativo                  boolean NOT NULL DEFAULT true,
  -- true = chapa_largura_mm/altura_mm vêm de medição/nota real; false =
  -- lote sem dimensão confirmada (migrado de um saldo antigo sem esse
  -- dado, ou pendente de conferência física). Otimizador/programação não
  -- devem oferecer um lote com dimensao_confirmada=false pra corte.
  dimensao_confirmada    boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotes_estoque_produto_ativo
  ON lotes_estoque (produto_id) WHERE ativo;

-- RLS: mesmo baseline usado em estoque/compras/compras_itens hoje
-- (auth.role() = 'authenticated', sem RBAC granular por perfil —
-- produtos é a exceção restrita a admin/financeiro por decisão da
-- auditoria de 2026-07-13; lotes_estoque é dado operacional consultado
-- por Otimizador/Compras/Pedidos, mesma classe de estoque, não de produtos).
ALTER TABLE lotes_estoque ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_select' AND tablename = 'lotes_estoque') THEN
    CREATE POLICY "auth_select" ON lotes_estoque FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert' AND tablename = 'lotes_estoque') THEN
    CREATE POLICY "auth_insert" ON lotes_estoque FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update' AND tablename = 'lotes_estoque') THEN
    CREATE POLICY "auth_update" ON lotes_estoque FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete' AND tablename = 'lotes_estoque') THEN
    CREATE POLICY "auth_delete" ON lotes_estoque FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── Verificação ──────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'lotes_estoque' ORDER BY ordinal_position;
-- SELECT * FROM pg_policies WHERE tablename = 'lotes_estoque';
