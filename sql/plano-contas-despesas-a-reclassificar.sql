-- ─────────────────────────────────────────────────────────
-- Plano de Contas — categoria "Despesas a Reclassificar"
-- Criada pra receber as 121 linhas da importação de `investimentos`
-- (histórico pago por ZRS/ITAÚ MAXIBUILD) que não têm equivalente
-- claro no plano de contas atual. Fica VISÍVEL no DRE de propósito —
-- não é a categoria 12 "Investimentos" (que carrega a nota
-- "Não listar no DRE"), porque a decisão de reclassificar essas
-- despesas é do contador, não deve ser antecipada escondendo o valor.
-- Rodar no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────

INSERT INTO pc_categorias (codigo, descricao, indicador, faixa_dre) VALUES
  (19, 'Despesas a Reclassificar', 'Débito', 'A Reclassificar')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO plano_contas (codigo, codigo_estruturado, descricao, categoria_id) VALUES
  (69, '19.1', 'Despesas a Reclassificar', (SELECT id FROM pc_categorias WHERE codigo = 19))
ON CONFLICT (codigo) DO NOTHING;
