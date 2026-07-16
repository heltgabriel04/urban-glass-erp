-- Ajuste pontual de dados — converte 11 pedidos de metro linear (R$15,00/ml)
-- para m² real (R$60,00/m²). Decisão do usuário: parar de usar metro linear
-- daqui pra frente (o modo continua existindo no sistema, só não será mais
-- usado) e recalcular retroativamente esses 11 pedidos já entregues pelo
-- padrão novo.
--
-- Nenhum desses pedidos tem nota fiscal emitida nem valor recebido
-- registrado (conferido antes de escrever este script) — sem conflito
-- fiscal ou de conciliação.
--
-- Fórmula aplicada (a mesma que /pedidos/novo e /pedidos/[id]/editar usam
-- pra m²): largura e altura arredondadas pra cima em múltiplos de 50mm,
-- área = (largura_arred/1000) × (altura_arred/1000) × quantidade,
-- subtotal = área × 60. Todos os 33 itens têm lapidacao = 0, então o
-- subtotal é só área × valor_m2, sem termo adicional.
--
-- 33 itens em 11 pedidos. Total muda de R$ 2.252,66 para R$ 7.370,55.

BEGIN;

-- ── Itens — recalcula m2/valor_m2/subtotal item a item (casado por id) ──

-- P-003
UPDATE itens_pedido SET m2 = 0.9000, valor_m2 = 60, subtotal = 54.00   WHERE id = 39;

-- P-015
UPDATE itens_pedido SET m2 = 0.9975, valor_m2 = 60, subtotal = 59.85   WHERE id = 90;

-- P-020
UPDATE itens_pedido SET m2 = 10.3250, valor_m2 = 60, subtotal = 619.50  WHERE id = 98;
UPDATE itens_pedido SET m2 = 10.3250, valor_m2 = 60, subtotal = 619.50  WHERE id = 99;
UPDATE itens_pedido SET m2 = 23.4000, valor_m2 = 60, subtotal = 1404.00 WHERE id = 96;
UPDATE itens_pedido SET m2 = 39.0000, valor_m2 = 60, subtotal = 2340.00 WHERE id = 97;

-- P-034
UPDATE itens_pedido SET m2 = 2.2050, valor_m2 = 60, subtotal = 132.30  WHERE id = 159;
UPDATE itens_pedido SET m2 = 4.2000, valor_m2 = 60, subtotal = 252.00  WHERE id = 160;

-- P-035
UPDATE itens_pedido SET m2 = 1.0500, valor_m2 = 60, subtotal = 63.00   WHERE id = 161;

-- P-036
UPDATE itens_pedido SET m2 = 0.7225, valor_m2 = 60, subtotal = 43.35   WHERE id = 162;

-- P-037
UPDATE itens_pedido SET m2 = 1.2600, valor_m2 = 60, subtotal = 75.60   WHERE id = 170;
UPDATE itens_pedido SET m2 = 1.4400, valor_m2 = 60, subtotal = 86.40   WHERE id = 168;
UPDATE itens_pedido SET m2 = 0.9775, valor_m2 = 60, subtotal = 58.65   WHERE id = 169;
UPDATE itens_pedido SET m2 = 1.3800, valor_m2 = 60, subtotal = 82.80   WHERE id = 171;
UPDATE itens_pedido SET m2 = 1.2600, valor_m2 = 60, subtotal = 75.60   WHERE id = 172;

-- P-038
UPDATE itens_pedido SET m2 = 0.2625, valor_m2 = 60, subtotal = 15.75   WHERE id = 173;
UPDATE itens_pedido SET m2 = 0.9375, valor_m2 = 60, subtotal = 56.25   WHERE id = 174;

-- P-039
UPDATE itens_pedido SET m2 = 1.0350, valor_m2 = 60, subtotal = 62.10   WHERE id = 188;
UPDATE itens_pedido SET m2 = 0.9000, valor_m2 = 60, subtotal = 54.00   WHERE id = 187;
UPDATE itens_pedido SET m2 = 1.5000, valor_m2 = 60, subtotal = 90.00   WHERE id = 189;
UPDATE itens_pedido SET m2 = 1.4000, valor_m2 = 60, subtotal = 84.00   WHERE id = 190;
UPDATE itens_pedido SET m2 = 1.4000, valor_m2 = 60, subtotal = 84.00   WHERE id = 191;
UPDATE itens_pedido SET m2 = 2.3000, valor_m2 = 60, subtotal = 138.00  WHERE id = 192;
UPDATE itens_pedido SET m2 = 1.3000, valor_m2 = 60, subtotal = 78.00   WHERE id = 193;
UPDATE itens_pedido SET m2 = 1.3000, valor_m2 = 60, subtotal = 78.00   WHERE id = 186;
UPDATE itens_pedido SET m2 = 1.5600, valor_m2 = 60, subtotal = 93.60   WHERE id = 194;
UPDATE itens_pedido SET m2 = 1.2500, valor_m2 = 60, subtotal = 75.00   WHERE id = 185;

-- P-044
UPDATE itens_pedido SET m2 = 0.7200, valor_m2 = 60, subtotal = 43.20   WHERE id = 217;
UPDATE itens_pedido SET m2 = 3.1200, valor_m2 = 60, subtotal = 187.20  WHERE id = 219;
UPDATE itens_pedido SET m2 = 1.6250, valor_m2 = 60, subtotal = 97.50   WHERE id = 220;
UPDATE itens_pedido SET m2 = 1.2600, valor_m2 = 60, subtotal = 75.60   WHERE id = 216;
UPDATE itens_pedido SET m2 = 0.7200, valor_m2 = 60, subtotal = 43.20   WHERE id = 218;

-- P-046
UPDATE itens_pedido SET m2 = 0.8100, valor_m2 = 60, subtotal = 48.60   WHERE id = 224;

-- ── Pedidos — soma dinâmica dos itens (não hardcoded), fica correto mesmo
--    se algum desses pedidos tiver outro item além dos 33 acima ──
UPDATE pedidos p SET
  valor_total = (SELECT COALESCE(SUM(i.subtotal), 0) FROM itens_pedido i WHERE i.pedido_id = p.id),
  m2_total    = (SELECT COALESCE(SUM(i.m2), 0)       FROM itens_pedido i WHERE i.pedido_id = p.id),
  updated_at  = now()
WHERE p.id IN ('P-003','P-015','P-020','P-034','P-035','P-036','P-037','P-038','P-039','P-044','P-046');

COMMIT;

-- ── Verificação ─────────────────────────────────────────────
-- Deve mostrar exatamente 11 linhas, valor_total batendo com a tabela
-- do relatório (P-020 = 4983.00 é o maior, P-046 = 48.60 o menor).
SELECT id, valor_total, m2_total, valor_recebido
FROM   pedidos
WHERE  id IN ('P-003','P-015','P-020','P-034','P-035','P-036','P-037','P-038','P-039','P-044','P-046')
ORDER  BY id;

-- Total geral (deve dar R$ 7.370,55)
SELECT SUM(valor_total) AS total_geral
FROM   pedidos
WHERE  id IN ('P-003','P-015','P-020','P-034','P-035','P-036','P-037','P-038','P-039','P-044','P-046');
