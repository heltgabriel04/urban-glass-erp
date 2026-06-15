-- ================================================================
-- MIGRAÇÃO: Módulo de Qualidade e Não Conformidades
-- Urban Glass ERP — Rodar no Supabase SQL Editor
-- ================================================================

-- ── 1. Tabela de Não Conformidades ───────────────────────────
CREATE TABLE IF NOT EXISTS public.nao_conformidades (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo               text NOT NULL UNIQUE,
  pedido_id            text REFERENCES public.pedidos(id) ON DELETE SET NULL,
  cliente_id           integer REFERENCES public.clientes(id) ON DELETE SET NULL,
  produto_nome         text,
  item_pedido_id       integer REFERENCES public.itens_pedido(id) ON DELETE SET NULL,
  etapa                text NOT NULL,
  tipo                 text NOT NULL,
  gravidade            text NOT NULL DEFAULT 'Média'
                         CHECK (gravidade IN ('Baixa','Média','Alta','Crítica')),
  status               text NOT NULL DEFAULT 'Aberta'
                         CHECK (status IN ('Aberta','Em Análise','Aguardando Correção','Resolvida','Cancelada')),
  descricao            text NOT NULL,
  obs                  text,
  fotos_urls           text[],
  registrado_por       text,
  responsavel_analise  text,
  dt_ocorrencia        timestamptz NOT NULL DEFAULT now(),
  dt_resolucao         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Histórico de alterações nas NCs ───────────────────────
CREATE TABLE IF NOT EXISTS public.historico_nc (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nc_id           bigint NOT NULL REFERENCES public.nao_conformidades(id) ON DELETE CASCADE,
  usuario         text,
  campo_alterado  text,
  valor_anterior  text,
  valor_novo      text,
  obs             text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Quebras de vidro ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quebras (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nc_id             bigint REFERENCES public.nao_conformidades(id) ON DELETE SET NULL,
  pedido_id         text REFERENCES public.pedidos(id) ON DELETE SET NULL,
  cliente_id        integer REFERENCES public.clientes(id) ON DELETE SET NULL,
  produto_nome      text NOT NULL,
  espessura         text,
  cor               text,
  chapa_referencia  text,
  largura_mm        numeric,
  altura_mm         numeric,
  m2_perdido        numeric NOT NULL CHECK (m2_perdido > 0),
  custo_m2          numeric,
  valor_perda       numeric GENERATED ALWAYS AS (
    CASE WHEN custo_m2 IS NOT NULL THEN m2_perdido * custo_m2 ELSE NULL END
  ) STORED,
  motivo            text NOT NULL,
  setor             text CHECK (setor IN ('Corte','Lapidação','Furação','Separação','Expedição','Recebimento')),
  maquina           text,
  responsavel       text,
  baixa_estoque     boolean NOT NULL DEFAULT false,
  dt_quebra         timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Retrabalhos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retrabalhos (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nc_id                 bigint REFERENCES public.nao_conformidades(id) ON DELETE SET NULL,
  pedido_id             text REFERENCES public.pedidos(id) ON DELETE SET NULL,
  cliente_id            integer REFERENCES public.clientes(id) ON DELETE SET NULL,
  produto_nome          text,
  motivo                text NOT NULL,
  etapa_origem          text NOT NULL,
  etapa_correcao        text NOT NULL,
  responsavel_original  text,
  responsavel_correcao  text,
  tempo_adicional_min   integer,
  custo_adicional       numeric,
  quantidade            integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  status                text NOT NULL DEFAULT 'Pendente'
                          CHECK (status IN ('Pendente','Em Execução','Concluído','Cancelado')),
  dt_retrabalho         timestamptz NOT NULL DEFAULT now(),
  dt_conclusao          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Vínculo entre custos de qualidade e lançamentos ────────
CREATE TABLE IF NOT EXISTS public.lancamentos_qualidade (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id  integer NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  origem_tipo    text NOT NULL CHECK (origem_tipo IN ('quebra','retrabalho','nc')),
  origem_id      bigint NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nc_pedido_id   ON public.nao_conformidades(pedido_id);
CREATE INDEX IF NOT EXISTS idx_nc_status      ON public.nao_conformidades(status);
CREATE INDEX IF NOT EXISTS idx_nc_gravidade   ON public.nao_conformidades(gravidade);
CREATE INDEX IF NOT EXISTS idx_nc_created_at  ON public.nao_conformidades(created_at);
CREATE INDEX IF NOT EXISTS idx_hnc_nc_id      ON public.historico_nc(nc_id);
CREATE INDEX IF NOT EXISTS idx_quebras_pedido ON public.quebras(pedido_id);
CREATE INDEX IF NOT EXISTS idx_quebras_dt     ON public.quebras(dt_quebra);
CREATE INDEX IF NOT EXISTS idx_retrab_pedido  ON public.retrabalhos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_retrab_status  ON public.retrabalhos(status);

-- ── 7. Trigger: atualiza updated_at nas NCs ──────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nc_updated_at'
  ) THEN
    CREATE TRIGGER trg_nc_updated_at
      BEFORE UPDATE ON public.nao_conformidades
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ── 8. View: indicadores mensais de qualidade ─────────────────
CREATE OR REPLACE VIEW public.view_indicadores_qualidade_mensal AS
SELECT
  date_trunc('month', n.dt_ocorrencia)::date        AS mes,
  COUNT(DISTINCT n.id)                              AS total_ncs,
  COUNT(DISTINCT n.id) FILTER (WHERE n.status = 'Resolvida') AS resolvidas,
  COUNT(DISTINCT n.id) FILTER (WHERE n.gravidade = 'Crítica') AS criticas,
  COALESCE(SUM(q.m2_perdido), 0)                   AS m2_perdido,
  COALESCE(SUM(q.valor_perda), 0)                  AS valor_perda_total,
  COUNT(DISTINCT r.id)                              AS total_retrabalhos,
  COALESCE(SUM(r.custo_adicional), 0)              AS custo_retrabalho
FROM public.nao_conformidades n
LEFT JOIN public.quebras q ON q.nc_id = n.id
LEFT JOIN public.retrabalhos r ON r.nc_id = n.id
GROUP BY 1
ORDER BY 1;

-- ── 9. View: quebras por responsável ──────────────────────────
CREATE OR REPLACE VIEW public.view_quebras_por_responsavel AS
SELECT
  COALESCE(responsavel, 'Não informado') AS responsavel,
  COUNT(*)                               AS total_quebras,
  COALESCE(SUM(m2_perdido), 0)          AS m2_perdido,
  COALESCE(SUM(valor_perda), 0)         AS valor_perda
FROM public.quebras
GROUP BY 1
ORDER BY valor_perda DESC;

-- ── 10. RLS: habilitar (ajustar políticas conforme seu setup) ──
ALTER TABLE public.nao_conformidades  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_nc       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quebras            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrabalhos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_qualidade ENABLE ROW LEVEL SECURITY;

-- Política básica: usuários autenticados têm acesso total
-- (ajuste conforme suas regras de RLS existentes)
CREATE POLICY "auth_full_access" ON public.nao_conformidades
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON public.historico_nc
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON public.quebras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON public.retrabalhos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full_access" ON public.lancamentos_qualidade
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ================================================================
-- FIM DA MIGRAÇÃO
-- ================================================================
