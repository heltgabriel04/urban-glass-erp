-- financeiro_clientes: abate permuta do a_receber, na fonte
--
-- Antes desta migração, a view financeiro_clientes (base de /dashboard,
-- /clientes, /clientes/[id], /dashboard-financeiro/estrategica e das
-- tabelas de cliente em /relatorios) calculava a_receber só a partir de
-- valor_total + valor_ipi - valor_recebido, sem saber que uma parcela
-- podia estar marcada como permuta. Resultado: mesmo marcando permuta, o
-- valor continuava contando como "a receber" em todas essas telas.
--
-- Fix na view em vez de em cada tela: soma o valor das parcelas em
-- permuta por cliente e abate do a_receber (nunca de faturado/recebido —
-- permuta não é dinheiro, não pode virar "recebido"). Enquanto nenhuma
-- parcela estiver marcada, o resultado é idêntico ao de antes.
--
-- Pré-requisito: sql/lancamentos-permuta.sql (coluna lancamentos.permuta).
-- Rodar no Supabase → SQL Editor. Idempotente.

create or replace view public.financeiro_clientes as
 SELECT c.id AS cliente_id,
    c.nome AS cliente_nome,
    c.cidade,
    COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) AS faturado,
    COALESCE(sum(p.valor_recebido), 0::numeric) AS recebido,
    GREATEST(
      COALESCE(sum(p.valor_total + p.valor_ipi - p.valor_recebido), 0::numeric) - COALESCE(perm.total_permuta, 0::numeric),
      0::numeric
    ) AS a_receber,
    count(p.id) AS total_pedidos,
        CASE
            WHEN COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) = 0::numeric THEN 0::numeric
            ELSE round(COALESCE(sum(p.valor_recebido), 0::numeric) / COALESCE(sum(p.valor_total + p.valor_ipi), 1::numeric) * 100::numeric, 2)
        END AS pct_recebido
   FROM clientes c
     LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status <> 'Cancelado'::text
     LEFT JOIN (
       SELECT cliente_id, sum(valor) AS total_permuta
       FROM lancamentos
       WHERE permuta = true AND tipo = 'Entrada'::text AND deletado_em IS NULL
       GROUP BY cliente_id
     ) perm ON perm.cliente_id = c.id
  GROUP BY c.id, c.nome, c.cidade, perm.total_permuta;

-- ── Verificação ─────────────────────────────────────────────
-- select * from public.financeiro_clientes order by faturado desc limit 5;
