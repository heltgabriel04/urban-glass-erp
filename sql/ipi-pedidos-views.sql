-- ============================================================
-- IPI nos Pedidos — ajusta views de faturamento pra somar o IPI
-- Views não estavam versionadas no repo; definições atuais obtidas
-- via pg_get_viewdef() e coladas pelo usuário em 2026-07-16.
-- Ver docs/superpowers/specs/2026-07-16-ipi-pedidos-design.md
--
-- Rodar no SQL Editor do Supabase, DEPOIS de sql/ipi-pedidos.sql
-- (precisa que pedidos.valor_ipi já exista).
-- ============================================================

create or replace view public.financeiro_clientes as
 SELECT c.id AS cliente_id,
    c.nome AS cliente_nome,
    c.cidade,
    COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) AS faturado,
    COALESCE(sum(p.valor_recebido), 0::numeric) AS recebido,
    COALESCE(sum(p.valor_total + p.valor_ipi - p.valor_recebido), 0::numeric) AS a_receber,
    count(p.id) AS total_pedidos,
        CASE
            WHEN COALESCE(sum(p.valor_total + p.valor_ipi), 0::numeric) = 0::numeric THEN 0::numeric
            ELSE round(COALESCE(sum(p.valor_recebido), 0::numeric) / COALESCE(sum(p.valor_total + p.valor_ipi), 1::numeric) * 100::numeric, 2)
        END AS pct_recebido
   FROM clientes c
     LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status <> 'Cancelado'::text
  GROUP BY c.id, c.nome, c.cidade;

create or replace view public.faturamento_mensal as
 SELECT EXTRACT(year FROM dt_pedido)::integer AS ano,
    EXTRACT(month FROM dt_pedido)::integer AS mes,
    sum(valor_total + valor_ipi) AS faturado,
    sum(valor_recebido) AS recebido,
    count(*) AS total_pedidos
   FROM pedidos
  WHERE status <> 'Cancelado'::text
  GROUP BY (EXTRACT(year FROM dt_pedido)::integer), (EXTRACT(month FROM dt_pedido)::integer)
  ORDER BY (EXTRACT(year FROM dt_pedido)::integer), (EXTRACT(month FROM dt_pedido)::integer);

-- ── Verificação ─────────────────────────────────────────────
-- select * from public.financeiro_clientes order by faturado desc limit 5;
-- select * from public.faturamento_mensal order by ano desc, mes desc limit 5;
