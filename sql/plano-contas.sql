-- ─────────────────────────────────────────────────────────
-- PLANO DE CONTAS · Urban Glass ERP
-- Rodar no SQL Editor do Supabase
-- ─────────────────────────────────────────────────────────

-- 1. Categorias (Nível 1)
CREATE TABLE IF NOT EXISTS pc_categorias (
  id          serial PRIMARY KEY,
  codigo      int UNIQUE NOT NULL,
  descricao   text NOT NULL,
  indicador   text NOT NULL CHECK (indicador IN ('Crédito', 'Débito')),
  faixa_dre   text NOT NULL,
  ativo       boolean DEFAULT true
);

ALTER TABLE pc_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc_cat_read"  ON pc_categorias;
DROP POLICY IF EXISTS "pc_cat_write" ON pc_categorias;
CREATE POLICY "pc_cat_read"  ON pc_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "pc_cat_write" ON pc_categorias FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 2. Plano de Contas (Nível 2)
CREATE TABLE IF NOT EXISTS plano_contas (
  id                  serial PRIMARY KEY,
  codigo              int UNIQUE NOT NULL,
  codigo_estruturado  text NOT NULL,
  descricao           text NOT NULL,
  categoria_id        int REFERENCES pc_categorias(id) ON DELETE SET NULL,
  ativo               boolean DEFAULT true
);

ALTER TABLE plano_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc_read"  ON plano_contas;
DROP POLICY IF EXISTS "pc_write" ON plano_contas;
CREATE POLICY "pc_read"  ON plano_contas FOR SELECT TO authenticated USING (true);
CREATE POLICY "pc_write" ON plano_contas FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────
-- SEED: 18 Categorias
-- ─────────────────────────────────────────────────────────
INSERT INTO pc_categorias (codigo, descricao, indicador, faixa_dre) VALUES
  (1,  'Receita com Vendas',                  'Crédito', 'Receitas'),
  (2,  'Impostos Sobre Vendas',               'Débito',  'Deduções sobre vendas'),
  (3,  'Outras Deduções',                     'Débito',  'Deduções sobre vendas'),
  (4,  'Custos Variáveis',                    'Débito',  'Custos variáveis'),
  (5,  'Gastos com Pessoal',                  'Débito',  'Custos fixos'),
  (6,  'Gastos com Ocupação',                 'Débito',  'Custos fixos'),
  (7,  'Gastos com Serviços de Terceiros',    'Débito',  'Custos fixos'),
  (8,  'Gastos com Marketing',                'Débito',  'Custos fixos'),
  (9,  'Receitas não Operacionais',           'Crédito', 'Resultado não operacional'),
  (10, 'Gastos não Operacionais',             'Débito',  'Resultado não operacional'),
  (11, 'Imposto de Renda e CSLL',             'Débito',  'Impostos diretos'),
  (12, 'Investimentos',                       'Débito',  'Não listar no DRE'),
  (13, 'Transferências e Ajustes de Saldo',   'Débito',  'Não listar no DRE'),
  (14, 'Transferências e Ajustes de Saldo',   'Crédito', 'Não listar no DRE'),
  (15, 'Patrimônio / Sócios',                 'Crédito', 'Não listar no DRE'),
  (16, 'Patrimônio / Sócios',                 'Débito',  'Não listar no DRE'),
  (17, 'Seguro Empréstimo Itaú',              'Débito',  'Resultado financeiro'),
  (18, 'Passivo - Empréstimo e Financiamento','Débito',  'Não listar no DRE')
ON CONFLICT (codigo) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- SEED: 68 Planos de Contas
-- ─────────────────────────────────────────────────────────
INSERT INTO plano_contas (codigo, codigo_estruturado, descricao, categoria_id) VALUES
  (1,  '1.1',  'Venda de produtos',                                (SELECT id FROM pc_categorias WHERE codigo=1)),
  (2,  '1.2',  'Prestação de serviços',                            (SELECT id FROM pc_categorias WHERE codigo=1)),
  (3,  '2.1',  'DAS - Simples Nacional',                           (SELECT id FROM pc_categorias WHERE codigo=2)),
  (4,  '2.2',  'PIS',                                              (SELECT id FROM pc_categorias WHERE codigo=2)),
  (5,  '2.3',  'COFINS',                                           (SELECT id FROM pc_categorias WHERE codigo=2)),
  (6,  '2.4',  'ISS',                                              (SELECT id FROM pc_categorias WHERE codigo=2)),
  (7,  '2.5',  'IPI',                                              (SELECT id FROM pc_categorias WHERE codigo=2)),
  (8,  '2.6',  'ICMS',                                             (SELECT id FROM pc_categorias WHERE codigo=2)),
  (9,  '3.1',  'Devoluções de clientes',                           (SELECT id FROM pc_categorias WHERE codigo=3)),
  (10, '3.2',  'Taxa de máquina de cartão',                        (SELECT id FROM pc_categorias WHERE codigo=3)),
  (11, '3.3',  'Taxa de aplicativos',                              (SELECT id FROM pc_categorias WHERE codigo=3)),
  (12, '3.4',  'Comissões para vendedores',                        (SELECT id FROM pc_categorias WHERE codigo=3)),
  (13, '4.1',  'Mercadoria para revenda',                          (SELECT id FROM pc_categorias WHERE codigo=4)),
  (14, '4.2',  'Matéria-prima',                                    (SELECT id FROM pc_categorias WHERE codigo=4)),
  (15, '4.3',  'Insumos',                                          (SELECT id FROM pc_categorias WHERE codigo=4)),
  (16, '4.4',  'Mão de obra variável',                             (SELECT id FROM pc_categorias WHERE codigo=4)),
  (17, '5.1',  'Pró-Labore',                                       (SELECT id FROM pc_categorias WHERE codigo=5)),
  (18, '5.2',  'Encargos sociais e trabalhistas',                  (SELECT id FROM pc_categorias WHERE codigo=5)),
  (19, '5.3',  'Salário',                                          (SELECT id FROM pc_categorias WHERE codigo=5)),
  (20, '5.4',  'Transporte',                                       (SELECT id FROM pc_categorias WHERE codigo=5)),
  (21, '5.5',  'Alimentação',                                      (SELECT id FROM pc_categorias WHERE codigo=5)),
  (22, '5.6',  'Saúde',                                            (SELECT id FROM pc_categorias WHERE codigo=5)),
  (23, '6.1',  'Água',                                             (SELECT id FROM pc_categorias WHERE codigo=6)),
  (24, '6.2',  'Aluguel, condomínio, IPTU',                        (SELECT id FROM pc_categorias WHERE codigo=6)),
  (25, '6.3',  'Telefone + Internet',                              (SELECT id FROM pc_categorias WHERE codigo=6)),
  (26, '6.4',  'Limpeza e conservação',                            (SELECT id FROM pc_categorias WHERE codigo=6)),
  (27, '6.5',  'Energia elétrica',                                 (SELECT id FROM pc_categorias WHERE codigo=6)),
  (28, '7.1',  'Contabilidade',                                    (SELECT id FROM pc_categorias WHERE codigo=7)),
  (29, '7.2',  'Serviços jurídicos',                               (SELECT id FROM pc_categorias WHERE codigo=7)),
  (30, '7.3',  'Consultoria',                                      (SELECT id FROM pc_categorias WHERE codigo=7)),
  (31, '8.1',  'Anúncios',                                         (SELECT id FROM pc_categorias WHERE codigo=8)),
  (32, '8.2',  'Propaganda',                                       (SELECT id FROM pc_categorias WHERE codigo=8)),
  (33, '8.3',  'Campanhas',                                        (SELECT id FROM pc_categorias WHERE codigo=8)),
  (34, '9.1',  'Juros de aplicação',                               (SELECT id FROM pc_categorias WHERE codigo=9)),
  (35, '9.2',  'Outras receitas não operacionais',                 (SELECT id FROM pc_categorias WHERE codigo=9)),
  (36, '10.1', 'Juros por atraso',                                 (SELECT id FROM pc_categorias WHERE codigo=10)),
  (37, '10.2', 'Tarifas bancárias',                                (SELECT id FROM pc_categorias WHERE codigo=10)),
  (38, '10.3', 'Outros gastos não operacionais',                   (SELECT id FROM pc_categorias WHERE codigo=10)),
  (39, '11.1', 'IRPJ',                                             (SELECT id FROM pc_categorias WHERE codigo=11)),
  (40, '11.2', 'CSLL',                                             (SELECT id FROM pc_categorias WHERE codigo=11)),
  (41, '12.1', 'Investimentos gerais',                             (SELECT id FROM pc_categorias WHERE codigo=12)),
  (42, '13.1', 'Transferência entre contas próprias - efetuadas',  (SELECT id FROM pc_categorias WHERE codigo=13)),
  (43, '13.2', 'Ajuste de saldo',                                  (SELECT id FROM pc_categorias WHERE codigo=13)),
  (44, '14.1', 'Transferência entre contas próprias - recebidas',  (SELECT id FROM pc_categorias WHERE codigo=14)),
  (45, '14.2', 'Ajuste de saldo',                                  (SELECT id FROM pc_categorias WHERE codigo=14)),
  (46, '12.2', 'Investimento – Máquina de Vidro Importada',        (SELECT id FROM pc_categorias WHERE codigo=12)),
  (47, '12.3', 'Nacionalização – Mercadoria para Revenda',         (SELECT id FROM pc_categorias WHERE codigo=12)),
  (48, '7.4',  'Serviços administrativos',                         (SELECT id FROM pc_categorias WHERE codigo=7)),
  (49, '12.4', 'Frete internacional – mercadoria',                 (SELECT id FROM pc_categorias WHERE codigo=12)),
  (50, '6.6',  'Despesas com veículos - seguros',                  (SELECT id FROM pc_categorias WHERE codigo=6)),
  (51, '7.5',  'Sistemas e softwares',                             (SELECT id FROM pc_categorias WHERE codigo=7)),
  (52, '12.5', 'Ajuste financeiro - Baixa cartão',                 (SELECT id FROM pc_categorias WHERE codigo=12)),
  (53, '12.6', 'Armazenagem mercadoria',                           (SELECT id FROM pc_categorias WHERE codigo=12)),
  (54, '7.6',  'Despesa comercial - frete',                        (SELECT id FROM pc_categorias WHERE codigo=7)),
  (55, '7.7',  'Manutenção e Conservação',                         (SELECT id FROM pc_categorias WHERE codigo=7)),
  (56, '15.1', 'Aporte de Sócios',                                 (SELECT id FROM pc_categorias WHERE codigo=15)),
  (57, '16.1', 'Retirada de Capital (Devolução de Aporte)',        (SELECT id FROM pc_categorias WHERE codigo=16)),
  (58, '12.7', 'Frete Nacional - Transporte mercadoria',           (SELECT id FROM pc_categorias WHERE codigo=12)),
  (59, '17.1', 'Seguro sobre Empréstimos',                         (SELECT id FROM pc_categorias WHERE codigo=17)),
  (60, '6.7',  'EPI e Segurança do Trabalho',                      (SELECT id FROM pc_categorias WHERE codigo=6)),
  (61, '6.8',  'Material de escritório',                           (SELECT id FROM pc_categorias WHERE codigo=6)),
  (62, '7.8',  'Despesas Cartoriais',                              (SELECT id FROM pc_categorias WHERE codigo=7)),
  (63, '7.9',  'Serviços de Análise de Crédito',                   (SELECT id FROM pc_categorias WHERE codigo=7)),
  (64, '7.10', 'Combustível',                                      (SELECT id FROM pc_categorias WHERE codigo=7)),
  (65, '7.11', 'Manutenção Veicular',                              (SELECT id FROM pc_categorias WHERE codigo=7)),
  (66, '18.1', 'Empréstimo Itaú',                                  (SELECT id FROM pc_categorias WHERE codigo=18)),
  (67, '12.8', 'Nacionalização - Impostos/Despesas',               (SELECT id FROM pc_categorias WHERE codigo=12)),
  (68, '7.12', 'Despesas com Amostras - Produtos Importação',      (SELECT id FROM pc_categorias WHERE codigo=7))
ON CONFLICT (codigo) DO NOTHING;
