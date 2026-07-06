-- Ajuste de valores do pedido P-061 (Laminado 3+3 Incolor)
-- Problema: os m² estavam errados e os subtotais embaralhados entre as linhas.
-- As dimensões (largura × altura) e o preço (R$ 140/m²) estão corretos, então
-- recalculamos m² = (largura*altura)/1e6 e subtotal = m² * 140 pra cada linha.
--
-- UPDATE no lugar (casando por largura/altura) em vez de DELETE+INSERT, pra
-- preservar os id dos itens e não orfanar blocos da Programação da Produção
-- (programacao_producao.item_pedido_id → itens_pedido.id).
--
-- Valores corretos:
--   712 × 1008 → 0.717696 m² → R$ 100,48
--   712 × 1025 → 0.729800 m² → R$ 102,17
--   712 × 1057 → 0.752584 m² → R$ 105,36
--   712 ×  992 → 0.706304 m² → R$  98,88
--   Total: R$ 406,89  |  m² total: 2.906384

DO $$
BEGIN
  UPDATE itens_pedido SET m2 = 0.717696, valor_m2 = 140, subtotal = 100.48
   WHERE pedido_id = 'P-061' AND largura = 712 AND altura = 1008;

  UPDATE itens_pedido SET m2 = 0.729800, valor_m2 = 140, subtotal = 102.17
   WHERE pedido_id = 'P-061' AND largura = 712 AND altura = 1025;

  UPDATE itens_pedido SET m2 = 0.752584, valor_m2 = 140, subtotal = 105.36
   WHERE pedido_id = 'P-061' AND largura = 712 AND altura = 1057;

  UPDATE itens_pedido SET m2 = 0.706304, valor_m2 = 140, subtotal = 98.88
   WHERE pedido_id = 'P-061' AND largura = 712 AND altura = 992;

  -- Atualiza totais do pedido
  UPDATE pedidos SET
    valor_total = 406.89,
    m2_total    = 2.906384,
    updated_at  = now()
  WHERE id = 'P-061';
END $$;

-- Verificação (confira as 4 linhas + o total)
SELECT largura, altura, m2, valor_m2, quantidade, subtotal
FROM   itens_pedido
WHERE  pedido_id = 'P-061'
ORDER BY altura;

SELECT id, valor_total, m2_total FROM pedidos WHERE id = 'P-061';
