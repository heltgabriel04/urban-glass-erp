-- Atribui os códigos TIPO e quantidades corretas da Relação de Vidros
-- (São Lourenço / Brasil Temper) ao pedido P-059.
-- O match é por posição de inserção (ROW_NUMBER ORDER BY id),
-- que corresponde à ordem dos itens no PDF importado.
--
-- Execute no SQL Editor do Supabase.

WITH itens_ranked AS (
  SELECT id, largura, altura, valor_m2
  , ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM itens_pedido
  WHERE pedido_id = 'P-059'
),
dados (rn, codigo, quantidade) AS (
  VALUES
  (1,  'GA1.1',    3),  (2,  'GA1.2',    3),  (3,  'GA1.3',    3),  (4,  'GA1.4',    3),
  (5,  'GA1.5',    6),  (6,  'GA1.6',    3),  (7,  'GA1.7',    3),  (8,  'GA1.8',    3),
  (9,  'GA10(A)',  1),  (10, 'GA10(A)',  1),  (11, 'GA10(B)',  1),  (12, 'GA10(B)',  1),
  (13, 'GA10(B)',  2),  (14, 'GA11(A)',  1),  (15, 'GA11(B)',  1),  (16, 'GA11(B)',  1),
  (17, 'GA11(B)',  2),  (18, 'GA11(C)',  1),  (19, 'GA11(C)',  1),  (20, 'GA2.1',    9),
  (21, 'GA2.2',    9),  (22, 'GA2.3',    3),  (23, 'GA2.4',    6),  (24, 'GA3.1',    9),
  (25, 'GA3.2',    9),  (26, 'GA3.3',   18),  (27, 'GA3.4',    9),  (28, 'GA3.5',    9),
  (29, 'GA3.6',    9),  (30, 'GA3.7',    9),  (31, 'GA3.8',    9),  (32, 'GA4.1(A)', 3),
  (33, 'GA4.1(A)', 3),  (34, 'GA4.1(A)', 6),  (35, 'GA4.1(B)', 3),  (36, 'GA4.1(B)', 3),
  (37, 'GA4.2(A)', 2),  (38, 'GA4.2(A)', 2),  (39, 'GA4.2(A)', 4),  (40, 'GA4.2(B)', 2),
  (41, 'GA4.2(B)', 2),  (42, 'GA4.3(A)', 1),  (43, 'GA4.3(A)', 1),  (44, 'GA4.3(A)', 2),
  (45, 'GA4.3(B)', 1),  (46, 'GA4.3(B)', 1),  (47, 'GA4.4(A)', 2),  (48, 'GA4.4(A)', 2),
  (49, 'GA4.4(A)', 4),  (50, 'GA4.4(B)', 2),  (51, 'GA4.4(B)', 2),  (52, 'GA4.5(A)', 1),
  (53, 'GA4.5(A)', 1),  (54, 'GA4.5(A)', 2),  (55, 'GA4.5(B)', 1),  (56, 'GA4.5(B)', 1),
  (57, 'GA4.6(A)', 1),  (58, 'GA4.6(B)', 1),  (59, 'GA4.6(B)', 1),  (60, 'GA4.6(B)', 1),
  (61, 'GA5.1(A)', 1),  (62, 'GA5.1(A)', 1),  (63, 'GA5.1(A)', 2),  (64, 'GA5.1(B)', 1),
  (65, 'GA5.1(B)', 1),  (66, 'GA5.2(A)', 2),  (67, 'GA5.2(A)', 2),  (68, 'GA5.2(A)', 4),
  (69, 'GA5.2(B)', 2),  (70, 'GA5.2(B)', 2),  (71, 'GA5.3(A)', 1),  (72, 'GA5.3(A)', 1),
  (73, 'GA5.3(A)', 2),  (74, 'GA5.3(B)', 1),  (75, 'GA5.3(B)', 1),  (76, 'GA5.4(A)', 2),
  (77, 'GA5.4(A)', 2),  (78, 'GA5.4(A)', 4),  (79, 'GA5.4(B)', 2),  (80, 'GA5.4(B)', 2),
  (81, 'GA5.5(A)', 1),  (82, 'GA5.5(A)', 1),  (83, 'GA5.5(A)', 2),  (84, 'GA5.5(B)', 1),
  (85, 'GA5.5(B)', 1),  (86, 'GA5.6(A)', 2),  (87, 'GA5.6(A)', 2),  (88, 'GA5.6(A)', 4),
  (89, 'GA5.6(B)', 2),  (90, 'GA5.6(B)', 2),  (91, 'GA5.7(A)', 1),  (92, 'GA5.7(A)', 1),
  (93, 'GA5.7(A)', 2),  (94, 'GA5.7(B)', 1),  (95, 'GA5.7(B)', 1),  (96, 'GA5.7(C)', 1),
  (97, 'GA6.1(A)', 5),  (98, 'GA6.1(A)', 5),  (99, 'GA6.1(B)', 5),  (100,'GA6.1(B)', 5),
  (101,'GA6.1(B)',10),  (102,'GA6.2(A)', 2),  (103,'GA6.2(A)', 2),  (104,'GA6.2(B)', 2),
  (105,'GA6.2(B)', 2),  (106,'GA6.2(B)', 4),  (107,'GA6.3(A)', 1),  (108,'GA6.3(A)', 1),
  (109,'GA6.3(B)', 1),  (110,'GA6.3(B)', 1),  (111,'GA6.3(B)', 2),  (112,'GA6.4(A)', 1),
  (113,'GA6.4(A)', 1),  (114,'GA6.4(B)', 1),  (115,'GA6.4(B)', 1),  (116,'GA6.4(B)', 2),
  (117,'GA7.1(A)', 3),  (118,'GA7.1(A)', 3),  (119,'GA7.1(B)', 3),  (120,'GA7.1(B)', 3),
  (121,'GA7.1(B)', 6),  (122,'GA7.1(C)', 3),  (123,'GA7.2(A)', 1),  (124,'GA7.2(A)', 1),
  (125,'GA7.2(B)', 1),  (126,'GA7.2(B)', 1),  (127,'GA7.2(B)', 2),  (128,'GA7.2(C)', 1),
  (129,'GA7.3(A)', 2),  (130,'GA7.3(A)', 2),  (131,'GA7.3(B)', 2),  (132,'GA7.3(B)', 2),
  (133,'GA7.3(B)', 4),  (134,'GA7.3(C)', 2),  (135,'GA7.4(A)', 3),  (136,'GA7.4(A)', 3),
  (137,'GA7.4(B)', 3),  (138,'GA7.4(B)', 3),  (139,'GA7.4(B)', 6),  (140,'GA7.4(C)', 3),
  (141,'GA7.5(A)', 1),  (142,'GA7.5(B)', 1),  (143,'GA7.5(B)', 1),  (144,'GA7.5(C)', 1),
  (145,'GA7.5(C)', 1),  (146,'GA7.5(C)', 5),  (147,'GA7.6(C)', 1),  (148,'GA8',      3),
  (149,'GA9',      3)
)
UPDATE itens_pedido ip
SET
  codigo_adicional = d.codigo,
  quantidade       = d.quantidade,
  -- recalcula m2 aplicando arredondamento para múltiplo de 50 (igual ao sistema)
  m2               = ROUND(
                       (CEIL(r.largura::numeric / 50) * 50 / 1000.0) *
                       (CEIL(r.altura::numeric  / 50) * 50 / 1000.0) *
                       d.quantidade
                     , 4),
  -- recalcula subtotal com o valor_m2 já existente
  subtotal         = ROUND(
                       (CEIL(r.largura::numeric / 50) * 50 / 1000.0) *
                       (CEIL(r.altura::numeric  / 50) * 50 / 1000.0) *
                       d.quantidade *
                       r.valor_m2
                     , 2)
FROM itens_ranked r
JOIN dados d ON d.rn = r.rn
WHERE ip.id = r.id;

-- Atualizar totais do pedido (m2_total e valor_total)
UPDATE pedidos
SET
  m2_total    = (SELECT ROUND(SUM(m2)::numeric, 4) FROM itens_pedido WHERE pedido_id = 'P-059'),
  valor_total = (SELECT ROUND(SUM(subtotal)::numeric, 2) FROM itens_pedido WHERE pedido_id = 'P-059'),
  updated_at  = NOW()
WHERE id = 'P-059';

-- Verificar resultado:
-- SELECT ip.id, ip.largura, ip.altura, ip.quantidade, ip.m2, ip.subtotal, ip.codigo_adicional
-- FROM itens_pedido ip WHERE ip.pedido_id = 'P-059' ORDER BY ip.id;
