-- Ajuste pontual de dados — P-081 e P-082 (cliente BRASIL TEMPER SERRALHERIA LTDA)
-- Achado 2026-09-04: diretor conferiu a m² à mão e não batia com o sistema.
--
-- Causa raiz: os dois pedidos foram salvos com o toggle "Metro Linear" ativo
-- em vez de "Metro Quadrado" (o modo ml continua existindo no sistema, só
-- não deveria mais ser usado — decisão de 2026-07-16, ver
-- sql/ajuste-metro-linear-para-m2.sql). Em modo ml o sistema calcula
-- (largura+altura)×quantidade em vez de largura×altura×quantidade, só que
-- o valor digitado (R$60) era o preço pensado para m² real — resultado:
-- todo item ficou super-cobrado.
--
-- pedidos.m2_total já estava correto nos dois casos (o cálculo do total da
-- página não tem esse bug, só o de cada item — inconsistência interna do
-- form). Só itens_pedido.m2/subtotal e pedidos.valor_total/valores_pgto
-- precisam de ajuste. Nenhum dos dois pedidos tem valor_recebido (R$0,00)
-- nem nota fiscal emitida — sem conflito fiscal/financeiro.
--
-- Fórmula oficial (a mesma usada em /pedidos/novo e /pedidos/[id]/editar):
-- largura e altura arredondadas pra cima em múltiplos de 50mm,
-- área = (largura_arred/1000) × (altura_arred/1000) × quantidade,
-- subtotal = área × valor_m2 (lapidacao = 0 nos dois pedidos).
--
-- P-081: valor_total 3518.40 -> 2921.10 (dif. -597.30)
-- P-082: valor_total 1006.86 ->  617.55 (dif. -389.31)
-- Total: -986.61

BEGIN;

-- ── P-081 — itens ──
UPDATE itens_pedido SET m2 = 6.3750, subtotal = 382.50  WHERE id = 1137; -- 1228x2503 qtd=2
UPDATE itens_pedido SET m2 = 3.8250, subtotal = 229.50  WHERE id = 1138; -- 1489x2503 qtd=1
UPDATE itens_pedido SET m2 = 3.9900, subtotal = 239.40  WHERE id = 1139; -- 1363x2850 qtd=1
UPDATE itens_pedido SET m2 = 3.0600, subtotal = 183.60  WHERE id = 1140; -- 1153x2503 qtd=1
UPDATE itens_pedido SET m2 = 23.9200, subtotal = 1435.20 WHERE id = 1141; -- 1288x2288 qtd=8
UPDATE itens_pedido SET m2 = 2.0250, subtotal = 121.50  WHERE id = 1142; -- 1463x1350 qtd=1
UPDATE itens_pedido SET m2 = 3.2400, subtotal = 194.40  WHERE id = 1143; -- 1158x1321 qtd=2
UPDATE itens_pedido SET m2 = 2.2500, subtotal = 135.00  WHERE id = 1144; -- 1473x1465 qtd=1

-- ── P-082 — itens ──
UPDATE itens_pedido SET m2 = 1.4375, subtotal = 86.25   WHERE id = 1145; -- 1144x1236 qtd=1
UPDATE itens_pedido SET m2 = 3.4500, subtotal = 207.00  WHERE id = 1146; -- 1144x1452 qtd=2
UPDATE itens_pedido SET m2 = 2.4150, subtotal = 144.90  WHERE id = 1147; -- 1144x1041 qtd=2
UPDATE itens_pedido SET m2 = 1.4950, subtotal = 89.70   WHERE id = 1148; -- 1144x1297 qtd=1
UPDATE itens_pedido SET m2 = 1.4950, subtotal = 89.70   WHERE id = 1149; -- 1144x1254 qtd=1

-- ── Pedidos — valor_total soma dinâmica dos itens; m2_total já estava
--    correto, não precisa mudar; valores_pgto reflete a parcela única de
--    cada um (à vista) ──
UPDATE pedidos SET
  valor_total = (SELECT COALESCE(SUM(i.subtotal), 0) FROM itens_pedido i WHERE i.pedido_id = pedidos.id),
  valores_pgto = jsonb_build_array((SELECT COALESCE(SUM(i.subtotal), 0) FROM itens_pedido i WHERE i.pedido_id = pedidos.id)),
  updated_at  = now()
WHERE id IN ('P-081', 'P-082');

COMMIT;

-- ── Lançamento financeiro ("A Receber" / Contas a Receber) — ficou
-- desatualizado na primeira rodada da correção (só pedidos.valor_total
-- tinha sido ajustado). Achado ao conferir a tela "Informações do Pedido
-- e Financeiro" ao vivo: o card "A Receber" ainda mostrava o valor
-- antigo. Ambos os lançamentos seguiam com status "A Receber" (nada
-- pago), então é seguro só trocar o valor. ──
UPDATE lancamentos SET valor = 2921.10 WHERE id = 389 AND pedido_id = 'P-081' AND status = 'A Receber';
UPDATE lancamentos SET valor =  617.55 WHERE id = 390 AND pedido_id = 'P-082' AND status = 'A Receber';

-- ── Verificação ─────────────────────────────────────────────
-- P-081: valor_total = 2921.10, m2_total = 48.685 (inalterado), lançamento 389 = 2921.10
-- P-082: valor_total =  617.55, m2_total = 10.2925 (inalterado), lançamento 390 =  617.55
SELECT id, valor_total, m2_total, valores_pgto, valor_recebido
FROM   pedidos
WHERE  id IN ('P-081', 'P-082')
ORDER  BY id;

SELECT id, pedido_id, valor, status
FROM   lancamentos
WHERE  pedido_id IN ('P-081', 'P-082');
