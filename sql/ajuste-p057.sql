-- Ajuste de itens e valores do pedido P-057
-- Preserva produto_id e produto_nome do primeiro item existente.
-- Soma dos subtotais = R$ 6.075,09  |  m² total = 29.634607

DO $$
DECLARE
  v_pid  integer;
  v_pnome text;
BEGIN
  -- Captura produto do primeiro item atual (para preservar)
  SELECT produto_id, produto_nome
  INTO   v_pid, v_pnome
  FROM   itens_pedido
  WHERE  pedido_id = 'P-057'
  ORDER BY id
  LIMIT 1;

  -- Remove todos os itens atuais
  DELETE FROM itens_pedido WHERE pedido_id = 'P-057';

  -- Insere os 13 itens conforme planilha MEDIDAS VIDROS
  -- (subtotais ajustados para fechar exato em R$ 6.075,09)
  INSERT INTO itens_pedido
    (pedido_id, produto_id, produto_nome, largura, altura, m2, valor_m2, lapidacao, quantidade, subtotal, vidro_cliente)
  VALUES
    ('P-057', v_pid, v_pnome,  610, 2385, 1.454850, 205, 0, 1,  298.24, false),
    ('P-057', v_pid, v_pnome,  810, 1934, 1.566540, 205, 0, 1,  321.14, false),
    ('P-057', v_pid, v_pnome,  810, 1935, 1.567350, 205, 0, 1,  321.31, false),
    ('P-057', v_pid, v_pnome,  610, 1934, 1.179740, 205, 0, 1,  241.85, false),
    ('P-057', v_pid, v_pnome,  610, 2335, 1.424350, 205, 0, 1,  291.99, false),
    ('P-057', v_pid, v_pnome,  810, 1934, 1.566540, 205, 0, 1,  321.14, false),
    ('P-057', v_pid, v_pnome, 1017, 2405, 7.337655, 205, 0, 3, 1504.23, false),  -- +R$0,01 ajuste arredondamento
    ('P-057', v_pid, v_pnome, 1104, 2407, 5.314656, 205, 0, 2, 1089.50, false),
    ('P-057', v_pid, v_pnome,  478, 2407, 2.301092, 205, 0, 2,  471.72, false),
    ('P-057', v_pid, v_pnome,  996,  983, 1.958136, 205, 0, 2,  401.42, false),
    ('P-057', v_pid, v_pnome, 1153,  983, 2.266798, 205, 0, 2,  464.69, false),
    ('P-057', v_pid, v_pnome,  710, 1280, 0.908800, 205, 0, 1,  186.30, false),
    ('P-057', v_pid, v_pnome,  710, 1110, 0.788100, 205, 0, 1,  161.56, false);

  -- Atualiza totais do pedido
  UPDATE pedidos SET
    valor_total = 6075.09,
    m2_total    = 29.634607,
    updated_at  = now()
  WHERE id = 'P-057';

END $$;
