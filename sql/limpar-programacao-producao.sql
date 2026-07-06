-- ============================================================
-- Limpa TODA a agenda da Programação da Produção (APS)
-- Execute no Supabase SQL Editor
-- ============================================================
-- Apaga literalmente todas as linhas de programacao_producao, inclusive
-- blocos já Concluídos (histórico de datas reais de início/fim). Não mexe
-- em pedidos/itens_pedido — só na agenda do Gantt, pra recomeçar do zero.
--
-- Efeitos em cascata já configurados no schema (nada extra a fazer aqui):
--   - programacao_historico.programacao_id → ON DELETE SET NULL
--     (o histórico de reagendamentos/recálculos é preservado, só perde o
--      link pro bloco apagado)
--   - programacao_retiradas.programacao_id → ON DELETE CASCADE
--     (registros de retirada parcial ligados aos blocos apagados somem
--      junto)

DELETE FROM programacao_producao;

-- Verificação (deve retornar 0)
SELECT count(*) AS blocos_restantes FROM programacao_producao;
