-- Atribui os códigos TIPO da Relação de Vidros (São Lourenço / Brasil Temper)
-- ao pedido P-059. O match é por posição de inserção (ROW_NUMBER ORDER BY id),
-- que corresponde à ordem dos itens no PDF importado.
--
-- Execute no SQL Editor do Supabase.

WITH itens_ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM itens_pedido
  WHERE pedido_id = 'P-059'
),
codigos (rn, codigo) AS (
  VALUES
  (1,  'GA1.1'),  (2,  'GA1.2'),  (3,  'GA1.3'),  (4,  'GA1.4'),
  (5,  'GA1.5'),  (6,  'GA1.6'),  (7,  'GA1.7'),  (8,  'GA1.8'),
  (9,  'GA10(A)'),(10, 'GA10(A)'),(11, 'GA10(B)'),(12, 'GA10(B)'),
  (13, 'GA10(B)'),(14, 'GA11(A)'),(15, 'GA11(B)'),(16, 'GA11(B)'),
  (17, 'GA11(B)'),(18, 'GA11(C)'),(19, 'GA11(C)'),(20, 'GA2.1'),
  (21, 'GA2.2'), (22, 'GA2.3'), (23, 'GA2.4'), (24, 'GA3.1'),
  (25, 'GA3.2'), (26, 'GA3.3'), (27, 'GA3.4'), (28, 'GA3.5'),
  (29, 'GA3.6'), (30, 'GA3.7'), (31, 'GA3.8'), (32, 'GA4.1(A)'),
  (33, 'GA4.1(A)'),(34,'GA4.1(A)'),(35,'GA4.1(B)'),(36,'GA4.1(B)'),
  (37, 'GA4.2(A)'),(38,'GA4.2(A)'),(39,'GA4.2(A)'),(40,'GA4.2(B)'),
  (41, 'GA4.2(B)'),(42,'GA4.3(A)'),(43,'GA4.3(A)'),(44,'GA4.3(A)'),
  (45, 'GA4.3(B)'),(46,'GA4.3(B)'),(47,'GA4.4(A)'),(48,'GA4.4(A)'),
  (49, 'GA4.4(A)'),(50,'GA4.4(B)'),(51,'GA4.4(B)'),(52,'GA4.5(A)'),
  (53, 'GA4.5(A)'),(54,'GA4.5(A)'),(55,'GA4.5(B)'),(56,'GA4.5(B)'),
  (57, 'GA4.6(A)'),(58,'GA4.6(B)'),(59,'GA4.6(B)'),(60,'GA4.6(B)'),
  (61, 'GA5.1(A)'),(62,'GA5.1(A)'),(63,'GA5.1(A)'),(64,'GA5.1(B)'),
  (65, 'GA5.1(B)'),(66,'GA5.2(A)'),(67,'GA5.2(A)'),(68,'GA5.2(A)'),
  (69, 'GA5.2(B)'),(70,'GA5.2(B)'),(71,'GA5.3(A)'),(72,'GA5.3(A)'),
  (73, 'GA5.3(A)'),(74,'GA5.3(B)'),(75,'GA5.3(B)'),(76,'GA5.4(A)'),
  (77, 'GA5.4(A)'),(78,'GA5.4(A)'),(79,'GA5.4(B)'),(80,'GA5.4(B)'),
  (81, 'GA5.5(A)'),(82,'GA5.5(A)'),(83,'GA5.5(A)'),(84,'GA5.5(B)'),
  (85, 'GA5.5(B)'),(86,'GA5.6(A)'),(87,'GA5.6(A)'),(88,'GA5.6(A)'),
  (89, 'GA5.6(B)'),(90,'GA5.6(B)'),(91,'GA5.7(A)'),(92,'GA5.7(A)'),
  (93, 'GA5.7(A)'),(94,'GA5.7(B)'),(95,'GA5.7(B)'),(96,'GA5.7(C)'),
  (97, 'GA6.1(A)'),(98,'GA6.1(A)'),(99,'GA6.1(B)'),(100,'GA6.1(B)'),
  (101,'GA6.1(B)'),(102,'GA6.2(A)'),(103,'GA6.2(A)'),(104,'GA6.2(B)'),
  (105,'GA6.2(B)'),(106,'GA6.2(B)'),(107,'GA6.3(A)'),(108,'GA6.3(A)'),
  (109,'GA6.3(B)'),(110,'GA6.3(B)'),(111,'GA6.3(B)'),(112,'GA6.4(A)'),
  (113,'GA6.4(A)'),(114,'GA6.4(B)'),(115,'GA6.4(B)'),(116,'GA6.4(B)'),
  (117,'GA7.1(A)'),(118,'GA7.1(A)'),(119,'GA7.1(B)'),(120,'GA7.1(B)'),
  (121,'GA7.1(B)'),(122,'GA7.1(C)'),(123,'GA7.2(A)'),(124,'GA7.2(A)'),
  (125,'GA7.2(B)'),(126,'GA7.2(B)'),(127,'GA7.2(B)'),(128,'GA7.2(C)'),
  (129,'GA7.3(A)'),(130,'GA7.3(A)'),(131,'GA7.3(B)'),(132,'GA7.3(B)'),
  (133,'GA7.3(B)'),(134,'GA7.3(C)'),(135,'GA7.4(A)'),(136,'GA7.4(A)'),
  (137,'GA7.4(B)'),(138,'GA7.4(B)'),(139,'GA7.4(B)'),(140,'GA7.4(C)'),
  (141,'GA7.5(A)'),(142,'GA7.5(B)'),(143,'GA7.5(B)'),(144,'GA7.5(C)'),
  (145,'GA7.5(C)'),(146,'GA7.5(C)'),(147,'GA7.6(C)'),(148,'GA8'),
  (149,'GA9')
)
UPDATE itens_pedido ip
SET codigo_adicional = c.codigo
FROM itens_ranked r
JOIN codigos c ON c.rn = r.rn
WHERE ip.id = r.id;

-- Verificar resultado:
-- SELECT ip.id, ip.largura, ip.altura, ip.quantidade, ip.codigo_adicional
-- FROM itens_pedido ip
-- WHERE ip.pedido_id = 'P-059'
-- ORDER BY ip.id;
