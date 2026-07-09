-- ─────────────────────────────────────────────────────────
-- Diagnóstico: quais migrações pendentes já foram rodadas?
-- Rode isso no SQL Editor do Supabase e me manda o resultado (ou só
-- olha a coluna "status" — RODOU ou FALTA RODAR).
--
-- Não altera nada, só confere se as colunas/tabelas existem.
-- ─────────────────────────────────────────────────────────

select arquivo, item, status from (
  values
    ('sql/pedidos-frete.sql', 'pedidos.frete',
      case when exists (select 1 from information_schema.columns where table_name='pedidos' and column_name='frete')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-nucleo.sql', 'lancamentos.deletado_em',
      case when exists (select 1 from information_schema.columns where table_name='lancamentos' and column_name='deletado_em')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-nucleo.sql', 'baixas_lancamento.valor_juros',
      case when exists (select 1 from information_schema.columns where table_name='baixas_lancamento' and column_name='valor_juros')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-formas-pagamento.sql', 'tabela formas_pagamento',
      case when exists (select 1 from information_schema.tables where table_name='formas_pagamento')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-adiantamentos.sql', 'lancamentos.natureza',
      case when exists (select 1 from information_schema.columns where table_name='lancamentos' and column_name='natureza')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-bloqueio-credito.sql', 'clientes.bloqueado_credito',
      case when exists (select 1 from information_schema.columns where table_name='clientes' and column_name='bloqueado_credito')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-historico.sql', 'tabela lancamentos_historico',
      case when exists (select 1 from information_schema.tables where table_name='lancamentos_historico')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-conciliacao.sql', 'tabela extratos_importados',
      case when exists (select 1 from information_schema.tables where table_name='extratos_importados')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa2-transferencias.sql', 'tabela transferencias_bancarias',
      case when exists (select 1 from information_schema.tables where table_name='transferencias_bancarias')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa3-compra-lancamento.sql', 'lancamentos.compra_id',
      case when exists (select 1 from information_schema.columns where table_name='lancamentos' and column_name='compra_id')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa3-filtros-salvos.sql', 'tabela filtros_salvos',
      case when exists (select 1 from information_schema.tables where table_name='filtros_salvos')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa5-metas.sql', 'tabela metas_financeiras',
      case when exists (select 1 from information_schema.tables where table_name='metas_financeiras')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa5-widgets-config.sql', 'tabela dashboard_widget_config',
      case when exists (select 1 from information_schema.tables where table_name='dashboard_widget_config')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/financeiro-etapa5-realtime.sql', 'publication supabase_realtime (lancamentos)',
      case when exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='lancamentos')
        then 'RODOU' else 'FALTA RODAR' end),
    ('sql/remove-centro-custo.sql', 'coluna lancamentos.centro_custo_id (deveria ter sumido)',
      case when exists (select 1 from information_schema.columns where table_name='lancamentos' and column_name='centro_custo_id')
        then 'AINDA EXISTE (SQL não rodado, sem problema, só não foi limpo)' else 'JÁ REMOVIDA' end)
) as t(arquivo, item, status)
order by status, arquivo;
