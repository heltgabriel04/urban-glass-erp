-- ============================================================
-- Tarefa 1 do prompt de evolução do APS — auditoria do sistema atual
-- Execute no Supabase SQL Editor
-- Achados obtidos por leitura direta do código (services/programacao.service.ts,
-- sql/fase1-estabilidade.sql), não por suposição.
-- ============================================================

CREATE TABLE IF NOT EXISTS aps_auditoria_achados (
  id uuid primary key default gen_random_uuid(),
  tipo_problema text not null check (tipo_problema in (
    'duplicacao', 'sobreposicao_capacidade', 'extensao_indevida', 'outro'
  )),
  descricao text not null,
  arquivo_codigo_referencia text,
  severidade text check (severidade in ('baixa', 'media', 'alta')),
  status text not null default 'identificado'
    check (status in ('identificado', 'em_correcao', 'corrigido')),
  identificado_em timestamptz not null default now()
);

INSERT INTO aps_auditoria_achados (tipo_problema, descricao, arquivo_codigo_referencia, severidade) VALUES

('duplicacao',
 'getPedidosSemProgramacao() exclui da fila pedidos que já têm programacao_producao ativa, mas só filtra quando há até 200 IDs já agendados (o código pula o filtro de exclusão inteiro acima disso — provável workaround de limite de URL do .not(''id'',''in'',...)). Passado esse limite, pedidos já agendados voltam a aparecer na fila "sem programação", habilitando reagendamento duplicado. Além disso a proteção é só a nível de pedido inteiro, não há UNIQUE constraint em (pedido_id, item_pedido_id, etapa) impedindo duplicação por outro caminho de código.',
 'services/programacao.service.ts:462-490', 'media'),

('sobreposicao_capacidade',
 'reagendar() (usado no drag-and-drop manual do Gantt) grava dt_inicio_previsto/dt_fim_previsto direto, sem validar contra o expediente da linha (inicio_dia/fim_dia), contra calendario_producao (feriados/bloqueios) ou contra soma de horas do dia. A única proteção existente é a constraint de banco no_overlap_linha (EXCLUDE USING gist), que impede dois blocos se sobrepormeem em horário NA MESMA linha — mas não impede um bloco cair fora do expediente, num feriado, ou exceder capacidade real se um recurso passar a ser compartilhado entre etapas (cenário do modelo de 2 pessoas alternando Corte/Lapidação por dia, que hoje não existe no schema).',
 'services/programacao.service.ts:687-724; sql/fase1-estabilidade.sql', 'alta'),

('extensao_indevida',
 'alocarBloco() empurra o bloco inteiro pro próximo dia útil quando ele não cabe antes do fim do expediente — nunca divide uma tarefa entre dias. Se a duração precisar de mais horas do que cabem num expediente inteiro, a condição de "não coube, tenta amanhã" nunca fica satisfeita e a função recursa indefinidamente (sem limite de tentativas) — não existe hoje uma extensão silenciosa incorreta, mas também não existe suporte a uma tarefa que precise de mais de um dia inteiro de capacidade (risco real para itens com quantidade/m² grande).',
 'services/programacao.service.ts:303-333', 'alta'),

('outro',
 'Algoritmo do "Recalcular Agenda" (gerarPropostaRecalculo): reflow guloso com gap-fill (alocarBloco/alocarBlocoEvitandoOcupados) dos blocos de Corte com status Agendado, não travado=true, começando a mais de 120min do momento atual, mais a fila pendente — ordenados por calcularPrioridadePedido() (slack real até o prazo, não FIFO). Refinamento local por troca de blocos adjacentes contíguos (até 5 rounds por linha). Nunca move blocos travado=true, em execução, concluídos, iminentes, ou que tenham uma Lapidação dependente já agendada (tratados como obstáculos fixos). Sempre exige preview + confirmação manual (ModalRecalculo) antes de gravar, com revalidação contra o estado atual do banco no momento do "Aplicar" (pula, não falha, blocos que mudaram desde a prévia).',
 'services/programacao.service.ts (gerarPropostaRecalculo, refinarComTrocasAdjacentes); app/programacao/page.tsx (ModalRecalculo)', 'baixa');

-- Verificação
SELECT tipo_problema, severidade, arquivo_codigo_referencia FROM aps_auditoria_achados ORDER BY
  CASE severidade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END;
