-- Ajuste de itens e valores do pedido P-060 (cliente NOVO CONCEITO)
-- Conforme PDF "PEDIDO - NOVO CONCEITO - 02-07-2026(corrigido)" (ORC-2026-003)
-- Preserva produto_id e produto_nome do primeiro item existente.
-- Soma dos subtotais = R$ 512,26 (arredondamento)  |  m² total = 3.658968

DO $$
DECLARE
  v_pid  integer;
  v_pnome text;
BEGIN
  -- Captura produto do primeiro item atual (para preservar)
  SELECT produto_id, produto_nome
  INTO   v_pid, v_pnome
  FROM   itens_pedido
  WHERE  pedido_id = 'P-060'
  ORDER BY id
  LIMIT 1;

  -- Remove todos os itens atuais
  DELETE FROM itens_pedido WHERE pedido_id = 'P-060';

  -- Insere os 4 itens conforme PDF do pedido
  INSERT INTO itens_pedido
    (pedido_id, produto_id, produto_nome, largura, altura, m2, valor_m2, lapidacao, quantidade, subtotal, vidro_cliente)
  VALUES
    ('P-060', v_pid, v_pnome, 712, 1057, 1.505168, 140, 0, 2, 210.72, false),
    ('P-060', v_pid, v_pnome, 712, 1008, 0.717696, 140, 0, 1, 100.48, false),
    ('P-060', v_pid, v_pnome, 712, 1025, 0.729800, 140, 0, 1, 102.17, false),
    ('P-060', v_pid, v_pnome, 712,  992, 0.706304, 140, 0, 1,  98.88, false);

  -- Atualiza totais do pedido
  UPDATE pedidos SET
    valor_total = 512.26,
    m2_total    = 3.658968,
    updated_at  = now()
  WHERE id = 'P-060';

END $$;
